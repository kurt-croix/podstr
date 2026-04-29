/**
 * Backfill descriptions for past episodes that have transcripts but no description tags
 *
 * This script:
 * - Fetches all kind 30054 podcast episodes from Nostr relays
 * - Filters for episodes with transcript tags but no description tag
 * - Downloads and parses SRT transcripts
 * - Generates show notes using z.ai GLM-5.1
 * - Updates episode events with description tags
 * - Publishes updated events to multiple relays
 *
 * Run once to backfill historical episodes, or as needed.
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { NSecSigner } from '@nostrify/nostrify';
import { promises as fs } from 'fs';
import { WebSocket } from 'ws';
import { queryRelay } from './lib/relay-query';

const RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
];

const ZHIPU_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const ZHIPU_MODEL = 'glm-5.1';

// --- SRT parsing (same as generate-show-notes.ts) ---

interface SrtEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

function parseSrt(content: string): SrtEntry[] {
  const blocks = content.trim().split(/\n\s*\n/);
  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const textLines = lines.slice(2).join(' ');
    const text = textLines.replace(/\[SPEAKER_\d+\]:?\s*/g, '').replace(/<v\s+[^>]+>:?\s*/g, '').trim();

    if (!text) continue;

    entries.push({ index, startTime: timeMatch[1], endTime: timeMatch[2], text });
  }

  return entries;
}

// --- GLM summarization (same as generate-show-notes.ts) ---

async function summarizeWithGLM(transcript: string, targetWordCount: number): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('ZHIPU_API_KEY is required');

  const systemPrompt = `You are a professional podcast show notes writer. You write clear, informative summaries of government meeting recordings. Focus on key decisions, discussions, votes, and action items. Write in a neutral, informative tone. Do not invent information that is not in the transcript.`;

  const userPrompt = `Summarize the following government meeting transcript in approximately ${targetWordCount} words. Cover the main topics discussed, key decisions made, and any notable points raised.

TRANSCRIPT:
${transcript}`;

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en',
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4095,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zhipu API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  if (result.choices?.[0]?.message?.content) {
    const usage = result.usage;
    console.log(`    tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total`);
    return result.choices[0].message.content;
  }

  throw new Error('Unexpected Zhipu API response format');
}

// --- Nostr event helpers ---

function createSigner(privateKey: string): NSecSigner {
  if (privateKey.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(privateKey);
      if (decoded.type === 'nsec') {
        const hexKey = Buffer.from(decoded.data as Uint8Array).toString('hex');
        return new NSecSigner(new Uint8Array(Buffer.from(hexKey, 'hex')));
      }
    } catch {
      // Fall through to hex
    }
  }
  return new NSecSigner(new Uint8Array(Buffer.from(privateKey, 'hex')));
}

async function publishToRelay(event: NostrEvent, relayUrl: string): Promise<boolean> {
  const TIMEOUT_MS = 15_000;
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(relayUrl);
    const timeoutId = setTimeout(() => { ws.close(); resolve(false); }, TIMEOUT_MS);

    ws.on('open', () => { ws.send(JSON.stringify(['EVENT', event])); });
    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      if (message[0] === 'OK') {
        clearTimeout(timeoutId);
        ws.close();
        resolve(!!message[2]);
      }
    });
    ws.on('error', () => { clearTimeout(timeoutId); ws.close(); resolve(false); });
  });
}

async function publishEvent(event: NostrEvent): Promise<boolean> {
  for (const relayUrl of RELAYS) {
    try {
      const ok = await publishToRelay(event, relayUrl);
      if (ok) {
        console.log(`      ✅ Published to ${relayUrl}`);
        return true;
      }
      console.log(`      ⚠️  Rejected by ${relayUrl}`);
    } catch {
      console.log(`      ⚠️  Failed to connect to ${relayUrl}`);
    }
  }
  return false;
}

async function updateEpisodeWithDescription(
  event: NostrEvent,
  shortSummary: string,
  showNotes: string,
  transcriptUrl: string | undefined,
  privateKey: string,
): Promise<NostrEvent> {
  const signer = createSigner(privateKey);

  const parts: string[] = [shortSummary];
  parts.push('\n\n===== FULL DESCRIPTION =====\n\n');
  parts.push(showNotes);
  if (transcriptUrl) {
    parts.push(`\n\nTranscription: ${transcriptUrl}`);
  }
  const description = parts.join('');

  const newTags = [...event.tags];
  const idx = newTags.findIndex(([name]) => name === 'description');
  if (idx >= 0) {
    newTags[idx] = ['description', description];
  } else {
    newTags.push(['description', description]);
  }

  return signer.signEvent({
    kind: event.kind,
    content: event.content,
    created_at: Math.floor(Date.now() / 1000),
    tags: newTags,
  });
}

// --- Main ---

async function main() {
  console.log('🔄 Backfilling descriptions for past episodes...');

  const nostrPrivateKey = process.env.NOSTR_PRIVATE_KEY;
  if (!nostrPrivateKey) {
    console.error('❌ NOSTR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (!process.env.ZHIPU_API_KEY) {
    console.error('❌ ZHIPU_API_KEY environment variable is required');
    process.exit(1);
  }

  // Get the signer's pubkey to query our own episodes
  const signer = createSigner(nostrPrivateKey);
  // For NSecSigner, we need the pubkey — derive from private key
  const { getPublicKey } = await import('nostr-tools');
  let pubkey: string;
  if (nostrPrivateKey.startsWith('nsec1')) {
    const decoded = nip19.decode(nostrPrivateKey);
    pubkey = getPublicKey(decoded.data as string);
  } else {
    pubkey = getPublicKey(nostrPrivateKey);
  }
  console.log(`🔑 Episode author pubkey: ${pubkey.substring(0, 8)}...`);

  // Fetch all kind 30054 episodes
  console.log('\n📡 Fetching episodes from relays...');
  const events = await queryRelay('wss://nos.lol', {
    kinds: [30054],
    authors: [pubkey],
    limit: 200,
  });
  console.log(`📊 Found ${events.length} total episode(s)`);

  // Filter: has transcript, no description
  const needsDescription = events.filter(event => {
    const hasTranscript = event.tags.some(([name]) => name === 'transcript');
    const hasDescription = event.tags.some(([name]) => name === 'description');
    return hasTranscript && !hasDescription;
  });

  console.log(`📝 ${needsDescription.length} episode(s) need descriptions`);

  if (needsDescription.length === 0) {
    console.log('✅ All episodes already have descriptions!');
    process.exit(0);
  }

  // Log episodes needing descriptions
  for (const event of needsDescription) {
    const title = event.tags.find(([name]) => name === 'title')?.[1] || 'Untitled';
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] || 'unknown';
    console.log(`  - ${title} (${dTag})`);
  }

  let successCount = 0;
  let failureCount = 0;

  for (const event of needsDescription) {
    const title = event.tags.find(([name]) => name === 'title')?.[1] || 'Untitled';
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] || 'unknown';
    const transcriptUrl = event.tags.find(([name]) => name === 'transcript')?.[1];

    console.log(`\n🔄 Processing: ${title} (${dTag})`);

    if (!transcriptUrl) {
      console.log(`   ⚠️  No transcript URL, skipping`);
      failureCount++;
      continue;
    }

    try {
      // Download transcript
      console.log(`   📥 Downloading transcript: ${transcriptUrl}`);
      const response = await fetch(transcriptUrl);
      if (!response.ok) {
        throw new Error(`Failed to download transcript: ${response.status}`);
      }
      const srtContent = await response.text();

      // Parse SRT
      const entries = parseSrt(srtContent);
      if (entries.length === 0) {
        throw new Error('No SRT entries found in transcript');
      }
      console.log(`   📊 Parsed ${entries.length} SRT entries`);

      // Extract clean text
      const text = entries.map(e => e.text).join(' ').replace(/\s+/g, ' ').trim();
      const wordCount = text.split(/\s+/).length;
      const targetWords = Math.round(wordCount * 0.20);
      console.log(`   📊 ${text.length} chars, ~${wordCount} words, targeting ~${targetWords} word summary`);

      // Generate show notes
      console.log(`   📝 Generating long summary...`);
      const showNotes = await summarizeWithGLM(text, targetWords);
      console.log(`   📝 Generating short summary...`);
      const shortSummary = await summarizeWithGLM(text, 100);

      // Update and publish
      const updatedEvent = await updateEpisodeWithDescription(
        event,
        shortSummary,
        showNotes,
        transcriptUrl,
        nostrPrivateKey,
      );

      console.log(`   📡 Publishing updated event...`);
      const published = await publishEvent(updatedEvent);
      if (published) {
        console.log(`   ✅ Episode updated successfully`);
        successCount++;
      } else {
        console.error(`   ❌ Failed to publish to any relay`);
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : error}`);
      failureCount++;
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failureCount}`);
  console.log(`  Skipped: ${needsDescription.length - successCount - failureCount}`);

  if (failureCount > 0) {
    console.log('\n⚠️  Some updates failed. Re-run to retry.');
    process.exit(1);
  }

  console.log('\n✅ All backfilled successfully!');
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

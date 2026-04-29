/**
 * Update podcast episodes with generated show notes as description tags
 *
 * This script:
 * - Reads the show notes mapping file (from generate-show-notes step)
 * - Reads the transcript mapping file (for original events)
 * - Updates episodes to include description tags with the generated summaries
 * - Publishes updated episodes to multiple Nostr relays
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { NSecSigner } from '@nostrify/nostrify';
import { promises as fs } from 'fs';
import { WebSocket } from 'ws';

interface ShowNotesResult {
  dTag: string;
  title: string;
  showNotes: string;
  shortSummary: string;
  success: boolean;
  error?: string;
}

interface TranscriptResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  event?: NostrEvent;
}

const SHOW_NOTES_MAPPING_PATH = '.show-notes-mapping.json';
const TRANSCRIPT_MAPPING_PATH = '.transcript-mapping.json';
const PUBLISH_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
];

/**
 * Parse nsec or hex private key into an NSecSigner
 */
function createSigner(privateKey: string): NSecSigner {
  if (privateKey.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(privateKey);
      if (decoded.type === 'nsec') {
        const hexKey = Buffer.from(decoded.data as Uint8Array).toString('hex');
        return new NSecSigner(new Uint8Array(Buffer.from(hexKey, 'hex')));
      }
    } catch {
      // Fall through to hex format
    }
  }
  return new NSecSigner(new Uint8Array(Buffer.from(privateKey, 'hex')));
}

/**
 * Update episode with description tag from show notes
 */
export async function updateEpisodeWithDescription(
  event: NostrEvent,
  shortSummary: string,
  showNotes: string,
  transcriptUrl: string | undefined,
  privateKey: string,
): Promise<NostrEvent> {
  const signer = createSigner(privateKey);

  // Build the description content matching RSS feed format
  const parts: string[] = [shortSummary];
  parts.push('\n\n===== FULL DESCRIPTION =====\n\n');
  parts.push(showNotes);
  if (transcriptUrl) {
    parts.push(`\n\nTranscription: ${transcriptUrl}`);
  }
  const description = parts.join('');

  // Build new tags — replace or add description tag
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

/**
 * Publish event to a single relay
 */
export async function publishToRelay(event: NostrEvent, relayUrl: string): Promise<boolean> {
  const TIMEOUT_MS = 15_000;

  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(relayUrl);

    const timeoutId = setTimeout(() => {
      ws.close();
      resolve(false);
    }, TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', event]));
    });

    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      if (message[0] === 'OK') {
        clearTimeout(timeoutId);
        ws.close();
        resolve(!!message[2]);
      }
    });

    ws.on('error', () => {
      clearTimeout(timeoutId);
      ws.close();
      resolve(false);
    });
  });
}

/**
 * Publish event to multiple relays, return true if at least one succeeds
 */
export async function publishEvent(event: NostrEvent): Promise<boolean> {
  for (const relayUrl of PUBLISH_RELAYS) {
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

/**
 * Main function
 */
async function main() {
  console.log('📝 Updating episodes with description tags...');

  const nostrPrivateKey = process.env.NOSTR_PRIVATE_KEY;

  if (!nostrPrivateKey) {
    console.error('❌ NOSTR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  // Read show notes mapping
  let showNotesResults: ShowNotesResult[];
  try {
    const content = await fs.readFile(SHOW_NOTES_MAPPING_PATH, 'utf-8');
    showNotesResults = JSON.parse(content);
    console.log(`📋 Found ${showNotesResults.length} show notes result(s)`);
  } catch (error) {
    console.error('❌ Failed to read show notes mapping:', error);
    process.exit(1);
  }

  // Filter to successful show notes
  const successfulNotes = showNotesResults.filter(r => r.success);
  if (successfulNotes.length === 0) {
    console.log('⏭️  No successful show notes to process');
    process.exit(0);
  }

  console.log(`✅ ${successfulNotes.length} successful show notes(s)`);

  // Read transcript mapping for original events and transcript URLs
  const transcriptMap = new Map<string, { event?: NostrEvent; transcriptUrl?: string }>();
  try {
    const content = await fs.readFile(TRANSCRIPT_MAPPING_PATH, 'utf-8');
    const transcriptResults: TranscriptResult[] = JSON.parse(content);
    for (const result of transcriptResults) {
      transcriptMap.set(result.dTag, {
        event: result.event,
        transcriptUrl: result.success ? result.transcriptUrl : undefined,
      });
    }
  } catch {
    console.log('⚠️  No transcript mapping found, proceeding without transcript URLs');
  }

  let successCount = 0;
  let failureCount = 0;

  console.log(`\n🔄 Starting episode description update process...`);
  console.log(`   Relays: ${PUBLISH_RELAYS.join(', ')}`);
  console.log(`   Episodes to update: ${successfulNotes.length}`);

  for (const noteResult of successfulNotes) {
    console.log(`\n🔄 Processing episode: ${noteResult.dTag}`);

    // Get the original event from transcript mapping
    const transcriptInfo = transcriptMap.get(noteResult.dTag);
    const event = transcriptInfo?.event;

    if (!event) {
      console.error(`   ❌ No event found for ${noteResult.dTag} — skipping`);
      failureCount++;
      continue;
    }

    try {
      const updatedEvent = await updateEpisodeWithDescription(
        event,
        noteResult.shortSummary,
        noteResult.showNotes,
        transcriptInfo?.transcriptUrl,
        nostrPrivateKey,
      );

      console.log(`   Publishing updated event...`);
      const published = await publishEvent(updatedEvent);
      if (published) {
        console.log(`   ✅ Episode updated with description successfully`);
        successCount++;
      } else {
        console.error(`   ❌ Failed to publish to any relay`);
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ Failed to update episode:`, error);
      failureCount++;
    }
  }

  console.log('\n📊 Update Summary:');
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failureCount}`);

  if (failureCount > 0) {
    console.log('\n⚠️  Some updates failed. Check logs for details.');
    process.exit(1);
  }

  console.log('\n✅ All episodes updated with descriptions successfully!');
  process.exit(0);
}

// Only run main when executed directly, not when imported by tests
if (process.argv[1]?.endsWith('update-episodes-with-descriptions.ts')) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

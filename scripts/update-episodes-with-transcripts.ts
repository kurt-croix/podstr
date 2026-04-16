/**
 * Update podcast episodes with transcript URLs
 *
 * This script:
 * - Reads the transcript mapping file (which includes original events from conversion step)
 * - Updates episodes to include transcript URLs
 * - Publishes updated episodes to multiple Nostr relays
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { NSecSigner } from '@nostrify/nostrify';
import { promises as fs } from 'fs';
import { WebSocket } from 'ws';

interface TranscriptionResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  error?: string;
  event?: NostrEvent; // Original episode event from conversion step
}

const TRANSCRIPT_MAPPING_PATH = '.transcript-mapping.json';
const PUBLISH_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
];

/**
 * Update episode with transcript URL
 */
export async function updateEpisodeWithTranscript(
  event: NostrEvent,
  transcriptUrl: string,
  privateKey: string,
): Promise<NostrEvent> {
  let signer;
  if (privateKey.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(privateKey);
      if (decoded.type === 'nsec') {
        const hexKey = Buffer.from(decoded.data as Uint8Array).toString('hex');
        signer = new NSecSigner(new Uint8Array(Buffer.from(hexKey, 'hex')));
      }
    } catch {
      // Assume hex format
      signer = new NSecSigner(new Uint8Array(Buffer.from(privateKey, 'hex')));
    }
  } else {
    signer = new NSecSigner(new Uint8Array(Buffer.from(privateKey, 'hex')));
  }

  // Build new tags — replace or add transcript tag
  const newTags = [...event.tags];
  const idx = newTags.findIndex(([name]) => name === 'transcript');
  if (idx >= 0) {
    newTags[idx] = ['transcript', transcriptUrl];
  } else {
    newTags.push(['transcript', transcriptUrl]);
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
  console.log('🔄 Updating episodes with transcript URLs...');

  const nostrPrivateKey = process.env.NOSTR_PRIVATE_KEY;

  if (!nostrPrivateKey) {
    console.error('❌ NOSTR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  // Read transcript mapping (includes original events from conversion step)
  let transcriptionResults: TranscriptionResult[];
  try {
    const mappingJson = await fs.readFile(TRANSCRIPT_MAPPING_PATH, 'utf-8');
    transcriptionResults = JSON.parse(mappingJson);
    console.log(`📋 Found ${transcriptionResults.length} transcription result(s)`);
  } catch (error) {
    console.error('❌ Failed to read transcript mapping:', error);
    process.exit(1);
  }

  // Filter to successful transcriptions
  const successfulTranscriptions = transcriptionResults.filter(r => r.success);
  console.log(`✅ ${successfulTranscriptions.length} successful transcription(s)`);

  if (successfulTranscriptions.length === 0) {
    console.log('⏭️  No successful transcriptions to process');
    process.exit(0);
  }

  let successCount = 0;
  let failureCount = 0;

  console.log(`\n🔄 Starting episode update process...`);
  console.log(`   Relays: ${PUBLISH_RELAYS.join(', ')}`);
  console.log(`   Episodes to update: ${successfulTranscriptions.length}`);

  for (const result of successfulTranscriptions) {
    console.log(`\n🔄 Processing episode: ${result.dTag}`);

    // Event must be present from the conversion step
    if (!result.event) {
      console.error(`   ❌ No event in mapping for ${result.dTag} — skipping`);
      failureCount++;
      continue;
    }

    console.log(`   ✅ Using event from pipeline (no relay fetch needed)`);

    try {
      const updatedEvent = await updateEpisodeWithTranscript(
        result.event,
        result.transcriptUrl,
        nostrPrivateKey,
      );

      console.log(`   Publishing updated event...`);
      const published = await publishEvent(updatedEvent);
      if (published) {
        console.log(`   ✅ Episode updated successfully`);
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

  console.log('\n✅ All episodes updated successfully!');
  process.exit(0);
}

// Only run main when executed directly, not when imported by tests
if (process.argv[1]?.endsWith('update-episodes-with-transcripts.ts')) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

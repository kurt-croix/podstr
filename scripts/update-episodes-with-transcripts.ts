/**
 * Update podcast episodes with transcript URLs
 *
 * This script:
 * - Reads the transcript mapping file
 * - Fetches existing episodes from Nostr
 * - Updates episodes to include transcript URLs
 * - Publishes updated episodes to Nostr
 */

import { nip19 } from 'nostr-tools';
import { NRelay1 } from '@nostrify/nostrify';
import type { NostrEvent } from '@nostrify/nostrify';
import { NSecSigner } from '@nostrify/nostrify';
import { NSyteBunkerSigner } from './lib/nsyte-bunker-minimal';
import { promises as fs } from 'fs';

interface TranscriptionResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  error?: string;
  event?: NostrEvent; // Original episode event to avoid re-fetching
}

interface EpisodeWithTranscript {
  dTag: string;
  transcriptUrl: string;
}

const TRANSCRIPT_MAPPING_PATH = '.transcript-mapping.json';

/**
 * Fetch episode from Nostr
 */
async function fetchEpisode(relayUrl: string, authorPubkey: string, dTag: string): Promise<NostrEvent | null> {
  console.log(`      Connecting to relay: ${relayUrl}`);
  const relay = new NRelay1(relayUrl);

  try {
    console.log(`      Sending query for episode ${dTag}...`);
    const signal = AbortSignal.timeout(10000); // 10 second timeout
    const events = await relay.query([{
      kinds: [30054],
      authors: [authorPubkey],
      '#d': [dTag],
      limit: 1,
    }], { signal });

    console.log(`      Query completed, closing relay connection`);
    relay.close();

    if (events.length > 0) {
      console.log(`      Found ${events.length} matching event(s)`);
      return events[0];
    }

    console.log(`      No events found matching query`);
    return null;
  } catch (error) {
    console.error(`      ❌ Error fetching episode ${dTag}:`, error);
    relay.close();
    return null;
  }
}

/**
 * Update episode with transcript URL
 */
async function updateEpisodeWithTranscript(
  event: NostrEvent,
  transcriptUrl: string,
  privateKey: string | undefined,
  nbunksec?: string
): Promise<NostrEvent> {
  // Create signer
  let signer;
  if (nbunksec) {
    console.log('🔐 Using nsyte bunker for remote signing');
    const [bunkerUrl, _rest] = nbunksec.split('?');
    signer = new NSyteBunkerSigner(bunkerUrl, nbunksec);
  } else {
    if (!privateKey) {
      throw new Error('Private key is required when not using nbunksec');
    }
    console.log('🔐 Using local NSecSigner');

    // Convert nsec (bech32) to hex if needed
    let hexPrivateKey = privateKey;
    if (privateKey.startsWith('nsec1')) {
      try {
        const decoded = nip19.decode(privateKey);
        if (decoded.type === 'nsec') {
          hexPrivateKey = Buffer.from(decoded.data as Uint8Array).toString('hex');
        }
      } catch {
        // Assume hex format
      }
    }

    // Convert hex string to Uint8Array for NSecSigner
    const privateKeyBytes = new Uint8Array(Buffer.from(hexPrivateKey, 'hex'));
    signer = new NSecSigner(privateKeyBytes);
  }

  // Check if transcript tag already exists
  const hasTranscriptTag = event.tags.some(([name]) => name === 'transcript');

  // Build new tags
  const newTags = [...event.tags];
  if (!hasTranscriptTag) {
    newTags.push(['transcript', transcriptUrl]);
  } else {
    // Replace existing transcript tag
    const transcriptIndex = newTags.findIndex(([name]) => name === 'transcript');
    if (transcriptIndex >= 0) {
      newTags[transcriptIndex] = ['transcript', transcriptUrl];
    }
  }

  // Create updated event
  const updatedEvent = await signer.signEvent({
    kind: event.kind,
    content: event.content,
    created_at: Math.floor(Date.now() / 1000),
    tags: newTags,
  });

  return updatedEvent;
}

/**
 * Publish event to Nostr
 */
async function publishEvent(event: NostrEvent, relayUrl: string): Promise<boolean> {
  console.log(`      Connecting to relay: ${relayUrl}`);
  const relay = new NRelay1(relayUrl);

  try {
    console.log(`      Publishing event ${event.id.substring(0, 8)}...`);
    const signal = AbortSignal.timeout(10000); // 10 second timeout
    const ok = await relay.event(event, { signal });
    console.log(`      Closing relay connection`);
    relay.close();

    if (ok) {
      console.log(`      Event published successfully`);
    } else {
      console.log(`      Event publication returned false`);
    }

    return ok;
  } catch (error) {
    console.error(`      ❌ Error publishing event:`, error);
    relay.close();
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔄 Updating episodes with transcript URLs...');

  // Get configuration
  const config = {
    nostrPrivateKey: process.env.NOSTR_PRIVATE_KEY!,
    nbunksec: process.env.NBUNKSEC,
    relayUrl: process.env.RELAY_URL || 'wss://nos.lol',
  };

  // Validate configuration
  if (!config.nbunksec && !config.nostrPrivateKey) {
    console.error('❌ Either NBUNKSEC or NOSTR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  // Read transcript mapping
  let transcriptionResults: TranscriptionResult[];
  try {
    const mappingJson = await fs.readFile(TRANSCRIPT_MAPPING_PATH, 'utf-8');
    transcriptionResults = JSON.parse(mappingJson);
    console.log(`📋 Found ${transcriptionResults.length} transcription result(s)`);
  } catch (error) {
    console.error('❌ Failed to read transcript mapping:', error);
    console.error(`   Expected file at: ${TRANSCRIPT_MAPPING_PATH}`);
    process.exit(1);
  }

  // Filter successful transcriptions
  const successfulTranscriptions = transcriptionResults.filter(r => r.success);
  console.log(`✅ ${successfulTranscriptions.length} successful transcription(s)`);

  if (successfulTranscriptions.length === 0) {
    console.log('⏭️  No successful transcriptions to process');
    process.exit(0);
  }

  // Get author pubkey
  let authorPubkey = '';
  if (config.nbunksec) {
    const [bunkerUrl, _rest] = config.nbunksec.split('?');
    const bunker = new NSyteBunkerSigner(bunkerUrl, config.nbunksec);
    // Get pubkey from bunker (this may require a connection)
    // For now, we'll use the event's pubkey
  } else {
    if (config.nostrPrivateKey.startsWith('nsec1')) {
      const decoded = nip19.decode(config.nostrPrivateKey);
      if (decoded.type === 'nsec') {
        authorPubkey = Buffer.from(decoded.data as Uint8Array).toString('hex');
      }
    } else {
      authorPubkey = config.nostrPrivateKey;
    }
  }

  console.log(`👤 Author pubkey: ${authorPubkey.substring(0, 8)}...`);

  // Update episodes
  let successCount = 0;
  let failureCount = 0;

  console.log(`\n🔄 Starting episode update process...`);
  console.log(`   Relay: ${config.relayUrl}`);
  console.log(`   Episodes to update: ${successfulTranscriptions.length}`);

  for (const result of successfulTranscriptions) {
    console.log(`\n🔄 Processing episode: ${result.dTag}`);
    console.log(`   Transcript URL: ${result.transcriptUrl}`);

    // Use event from transcription result if available
    let episode = result.event;

    // Only fetch if we don't have the event
    if (!episode) {
      console.log(`   Step 1: Fetching episode from relay...`);
      episode = await fetchEpisode(config.relayUrl, authorPubkey, result.dTag);
      if (!episode) {
        console.error(`❌ Failed to fetch episode ${result.dTag}`);
        failureCount++;
        continue;
      }
    } else {
      console.log(`   Step 1: Using original episode event (no fetch needed)`);
    }

    console.log(`   ✅ Found episode: ${episode.id.substring(0, 8)}...`);

    // Update episode with transcript URL
    try {
      console.log(`   Step 2: Updating event with transcript URL...`);
      const updatedEvent = await updateEpisodeWithTranscript(
        episode,
        result.transcriptUrl,
        config.nostrPrivateKey,
        config.nbunksec
      );

      console.log(`   ✅ Updated event: ${updatedEvent.id.substring(0, 8)}...`);

      // Publish updated event
      console.log(`   Step 3: Publishing updated event to relay...`);
      const published = await publishEvent(updatedEvent, config.relayUrl);
      if (published) {
        console.log(`   ✅ Published updated event successfully`);
        successCount++;
      } else {
        console.error(`   ❌ Failed to publish updated event`);
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ Failed to update episode:`, error);
      failureCount++;
    }

    console.log(`   Episode processing complete`);
  }

  // Log summary
  console.log('\n📊 Update Summary:');
  console.log(`  Total episodes: ${successfulTranscriptions.length}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failureCount}`);

  if (failureCount > 0) {
    console.log('\n⚠️  Some updates failed. Check logs for details.');
    process.exit(1);
  }

  console.log('\n✅ All episodes updated successfully!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

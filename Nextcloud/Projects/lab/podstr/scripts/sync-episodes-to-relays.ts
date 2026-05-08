/**
 * Sync episodes to all relays
 *
 * Final pipeline step: after transcript and description updates, query each relay
 * for the updated episodes and ensure every relay has the most complete version.
 * Finds the event version with the most tags and republishes it to relays that
 * are missing transcript or description tags.
 */

import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { NSecSigner } from '@nostrify/nostrify';
import { promises as fs } from 'fs';
import { WebSocket } from 'ws';
import { queryRelay } from './lib/relay-query';
import { PUBLISH_RELAYS } from './lib/constants';

interface TranscriptResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  error?: string;
  event?: NostrEvent;
}

interface ShowNotesResult {
  dTag: string;
  title: string;
  showNotes: string;
  shortSummary: string;
  success: boolean;
  error?: string;
}

/** Create NSecSigner from nsec or hex private key */
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

/** Publish event to a single relay */
async function publishToRelay(event: NostrEvent, relayUrl: string): Promise<boolean> {
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

/** Count "content" tags (transcript, description) on an event */
function countContentTags(event: NostrEvent): number {
  const contentTagNames = ['transcript', 'description', 'summary'];
  return event.tags.filter(([name]) => contentTagNames.includes(name)).length;
}

/** Find the most complete event version from a set of relay results */
function findMostCompleteEvent(events: (NostrEvent | null)[]): NostrEvent | null {
  const valid = events.filter((e): e is NostrEvent => e !== null);
  if (valid.length === 0) return null;

  // Prefer the version with the most content-related tags
  valid.sort((a, b) => countContentTags(b) - countContentTags(a));
  return valid[0];
}

/** Check if an event has specific tags */
function hasTags(event: NostrEvent, tagNames: string[]): boolean {
  return tagNames.every(name => event.tags.some(([n]) => n === name));
}

async function main() {
  console.log('🔄 Syncing episodes to all relays...');

  const nostrPrivateKey = process.env.NOSTR_PRIVATE_KEY;

  if (!nostrPrivateKey) {
    console.error('❌ NOSTR_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const signer = createSigner(nostrPrivateKey);

  // Collect all d-tags from pipeline outputs
  const dTags = new Set<string>();

  // Read transcript mapping
  try {
    const mappingJson = await fs.readFile('.transcript-mapping.json', 'utf-8');
    const transcriptResults: TranscriptResult[] = JSON.parse(mappingJson);
    transcriptResults.filter(r => r.success).forEach(r => dTags.add(r.dTag));
    console.log(`📋 Found ${dTags.size} d-tag(s) from transcript mapping`);
  } catch {
    console.log('⚠️  No transcript mapping found');
  }

  // Read show notes mapping
  try {
    const notesJson = await fs.readFile('.show-notes-mapping.json', 'utf-8');
    const notesResults: ShowNotesResult[] = JSON.parse(notesJson);
    notesResults.filter(r => r.success).forEach(r => dTags.add(r.dTag));
    console.log(`📋 Found ${dTags.size} total d-tag(s) after show notes mapping`);
  } catch {
    console.log('⚠️  No show notes mapping found');
  }

  if (dTags.size === 0) {
    console.log('⏭️  No episodes to sync');
    process.exit(0);
  }

  // Get the pubkey for querying
  const pubkey = (() => {
    if (nostrPrivateKey.startsWith('nsec1')) {
      const decoded = nip19.decode(nostrPrivateKey);
      const hexKey = Buffer.from(decoded.data as Uint8Array).toString('hex');
      const signer = new NSecSigner(new Uint8Array(Buffer.from(hexKey, 'hex')));
      // We can derive pubkey from nsec, but it's easier to just query by d-tag
    }
    return undefined;
  })();

  // We need the pubkey to query — derive it from the private key
  // Use nostr-tools getPublicKey for hex key
  let authorPubkey: string;
  const { getPublicKey } = await import('nostr-tools');
  if (nostrPrivateKey.startsWith('nsec1')) {
    const decoded = nip19.decode(nostrPrivateKey);
    authorPubkey = getPublicKey(decoded.data as string);
  } else {
    authorPubkey = getPublicKey(nostrPrivateKey);
  }
  console.log(`🔑 Author pubkey: ${authorPubkey.substring(0, 8)}...`);

  let syncCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const dTag of dTags) {
    console.log(`\n🔄 Syncing episode: ${dTag}`);

    // Query all relays for this episode
    const relayResults = new Map<string, NostrEvent | null>();

    for (const relayUrl of PUBLISH_RELAYS) {
      try {
        const events = await queryRelay(relayUrl, {
          kinds: [30054],
          authors: [authorPubkey],
          '#d': [dTag],
        });
        relayResults.set(relayUrl, events[0] || null);
        const event = events[0];
        if (event) {
          const tags = event.tags.map(([n]) => n).join(', ');
          const hasTrans = event.tags.some(([n]) => n === 'transcript');
          const hasDesc = event.tags.some(([n]) => n === 'description');
          console.log(`   ${relayUrl}: found (trans:${hasTrans} desc:${hasDesc})`);
        } else {
          console.log(`   ${relayUrl}: NOT FOUND`);
        }
      } catch {
        relayResults.set(relayUrl, null);
        console.log(`   ${relayUrl}: ERROR`);
      }
    }

    // Find the most complete version
    const allEvents = [...relayResults.values()];
    const mostComplete = findMostCompleteEvent(allEvents);

    if (!mostComplete) {
      console.log(`   ❌ No version found on any relay — skipping`);
      failCount++;
      continue;
    }

    const requiredTags = ['transcript', 'description'];
    const hasAll = hasTags(mostComplete, requiredTags);
    console.log(`   📋 Most complete version: ${mostComplete.id.substring(0, 8)}... (tags: ${mostComplete.tags.length}, has all: ${hasAll})`);

    // Check which relays need updating
    const relaysNeedingSync = PUBLISH_RELAYS.filter(relayUrl => {
      const event = relayResults.get(relayUrl);
      if (!event) return true; // Missing entirely
      return !hasTags(event, requiredTags); // Missing required tags
    });

    if (relaysNeedingSync.length === 0) {
      console.log(`   ✅ All relays have complete version`);
      skipCount++;
      continue;
    }

    console.log(`   📡 Republishing to ${relaysNeedingSync.length} relay(s): ${relaysNeedingSync.join(', ')}`);

    // Re-sign the most complete version (addressable events need same created_at)
    const signedEvent = await signer.signEvent({
      kind: mostComplete.kind,
      content: mostComplete.content,
      created_at: mostComplete.created_at,
      tags: mostComplete.tags,
    });

    // Publish to relays that need it
    let anyFail = false;
    for (const relayUrl of relaysNeedingSync) {
      try {
        const ok = await publishToRelay(signedEvent, relayUrl);
        if (ok) {
          console.log(`   ✅ Published to ${relayUrl}`);
        } else {
          console.log(`   ⚠️  Rejected by ${relayUrl}`);
          anyFail = true;
        }
      } catch {
        console.log(`   ❌ Failed to connect to ${relayUrl}`);
        anyFail = true;
      }
    }

    if (anyFail) {
      failCount++;
    } else {
      syncCount++;
    }
  }

  console.log('\n📊 Sync Summary:');
  console.log(`  Synced: ${syncCount}`);
  console.log(`  Already complete: ${skipCount}`);
  console.log(`  Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some syncs failed. Check logs for details.');
    process.exit(1);
  }

  console.log('\n✅ All relays synced!');
  process.exit(0);
}

// Only run main when executed directly
if (process.argv[1]?.endsWith('sync-episodes-to-relays.ts')) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

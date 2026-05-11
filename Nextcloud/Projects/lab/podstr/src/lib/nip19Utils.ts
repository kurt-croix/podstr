import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Default relays to include in nevent encodings for better discoverability
 */
const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io'
];

/**
 * Encode a Nostr event as nevent with relay hints for better discoverability
 * @param event The Nostr event to encode
 * @param customRelays Optional custom relays to include
 * @returns nevent string
 */
export function encodeNevent(event: NostrEvent, customRelays?: string[]): string {
  const relays = customRelays || DEFAULT_RELAYS;
  
  return nip19.neventEncode({
    id: event.id,
    relays,
    author: event.pubkey
  });
}

/**
 * Encode an event ID as nevent with relay hints
 * @param eventId The event ID to encode
 * @param authorPubkey The author's pubkey
 * @param customRelays Optional custom relays to include
 * @returns nevent string
 */
export function encodeEventIdAsNevent(
  eventId: string, 
  authorPubkey: string, 
  customRelays?: string[]
): string {
  const relays = customRelays || DEFAULT_RELAYS;
  
  return nip19.neventEncode({
    id: eventId,
    relays,
    author: authorPubkey
  });
}

/**
 * Encode a Nostr addressable event as naddr with relay hints
 * @param event The addressable Nostr event to encode (kind 30000-39999)
 * @param customRelays Optional custom relays to include
 * @returns naddr string
 */
export function encodeNaddr(event: NostrEvent, customRelays?: string[]): string {
  const relays = customRelays || DEFAULT_RELAYS;
  
  // Find the 'd' tag for the identifier
  const dTag = event.tags.find(([name]) => name === 'd');
  const identifier = dTag?.[1] || '';
  
  return nip19.naddrEncode({
    identifier,
    pubkey: event.pubkey,
    kind: event.kind,
    relays
  });
}

/**
 * Encode addressable event parameters as naddr with relay hints
 * @param pubkey The author's pubkey
 * @param kind The event kind (30000-39999)
 * @param identifier The 'd' tag identifier
 * @param customRelays Optional custom relays to include
 * @returns naddr string
 */
export function encodeAddressableEvent(
  pubkey: string,
  kind: number,
  identifier: string,
  customRelays?: string[]
): string {
  const relays = customRelays || DEFAULT_RELAYS;
  
  return nip19.naddrEncode({
    identifier,
    pubkey,
    kind,
    relays
  });
}

/**
 * Encode a podcast episode as naddr (for addressable episode events)
 * @param pubkey The episode author's pubkey
 * @param identifier The episode 'd' tag identifier
 * @param customRelays Optional custom relays to include
 * @returns naddr string for the episode
 */
export function encodeEpisodeAsNaddr(
  pubkey: string,
  identifier: string,
  customRelays?: string[]
): string {
  const relays = customRelays || DEFAULT_RELAYS;
  
  return nip19.naddrEncode({
    identifier,
    pubkey,
    kind: 30054, // PODCAST_KINDS.EPISODE
    relays
  });
}

/**
 * Get the default relays used for nevent encoding
 * @returns Array of default relay URLs
 */
export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS];
}
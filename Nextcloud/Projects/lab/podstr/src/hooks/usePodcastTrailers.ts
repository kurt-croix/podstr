import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { PODCAST_KINDS, getCreatorPubkeyHex } from '@/lib/podcastConfig';
import type { PodcastTrailer } from '@/types/podcast';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Validates if a Nostr event is a valid podcast trailer
 */
function validatePodcastTrailer(event: NostrEvent): boolean {
  if (event.kind !== PODCAST_KINDS.TRAILER) return false;

  // Check for required title tag
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  if (!title) return false;

  // Check for required URL tag
  const url = event.tags.find(([name]) => name === 'url')?.[1];
  if (!url) return false;

  // Check for required pubdate tag
  const pubdate = event.tags.find(([name]) => name === 'pubdate')?.[1];
  if (!pubdate) return false;

  return true;
}

/**
 * Converts a validated Nostr event to a PodcastTrailer object
 */
function eventToPodcastTrailer(event: NostrEvent): PodcastTrailer {
  const tags = new Map(event.tags.map(([key, ...values]) => [key, values]));

  const title = tags.get('title')?.[0] || 'Untitled Trailer';
  const url = tags.get('url')?.[0] || '';
  const pubdateStr = tags.get('pubdate')?.[0];
  const lengthStr = tags.get('length')?.[0];
  const type = tags.get('type')?.[0];
  const seasonStr = tags.get('season')?.[0];
  
  // Parse pubdate (RFC2822 format)
  let pubDate: Date;
  try {
    pubDate = pubdateStr ? new Date(pubdateStr) : new Date(event.created_at * 1000);
  } catch {
    pubDate = new Date(event.created_at * 1000);
  }

  // Extract identifier from 'd' tag (for addressable events)
  const identifier = tags.get('d')?.[0] || event.id;

  return {
    id: event.id,
    title,
    url,
    pubDate,
    length: lengthStr ? parseInt(lengthStr, 10) : undefined,
    type,
    season: seasonStr ? parseInt(seasonStr, 10) : undefined,
    eventId: event.id,
    authorPubkey: event.pubkey,
    identifier,
    createdAt: new Date(event.created_at * 1000),
  };
}

/**
 * Hook to fetch podcast trailers from Nostr
 */
export function usePodcastTrailers() {
  const { nostr } = useNostr();
  const creatorPubkeyHex = getCreatorPubkeyHex();

  return useQuery<PodcastTrailer[]>({
    queryKey: ['podcast-trailers'],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(1500)]);
      
      // Query for trailer events from the podcast creator
      const events = await nostr.query([{
        kinds: [PODCAST_KINDS.TRAILER],
        authors: [creatorPubkeyHex],
        limit: 50
      }], { signal });

      // Filter and validate events
      const validEvents = events.filter(validatePodcastTrailer);

      // Deduplicate addressable events by 'd' tag identifier (keep only latest version)
      const trailersByIdentifier = new Map<string, NostrEvent>();
      
      validEvents.forEach(event => {
        // Get the 'd' tag identifier for addressable events
        const identifier = event.tags.find(([name]) => name === 'd')?.[1];
        if (!identifier) return; // Skip events without 'd' tag
        
        const existing = trailersByIdentifier.get(identifier);
        // Keep the latest version (highest created_at timestamp)
        if (!existing || event.created_at > existing.created_at) {
          trailersByIdentifier.set(identifier, event);
        }
      });

      // Convert to PodcastTrailer format  
      const trailers = Array.from(trailersByIdentifier.values()).map(eventToPodcastTrailer);
      
      // Additional deduplication by URL + title combination (in case same content was published with different identifiers)
      const trailersByContent = new Map<string, PodcastTrailer>();
      
      trailers.forEach(trailer => {
        const contentKey = `${trailer.url}-${trailer.title}`;
        const existing = trailersByContent.get(contentKey);
        
        // Keep the latest version by publication date
        if (!existing || trailer.pubDate.getTime() > existing.pubDate.getTime()) {
          trailersByContent.set(contentKey, trailer);
        }
      });
      
      // Sort by pubDate (newest first)
      return Array.from(trailersByContent.values())
        .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
}

/**
 * Hook to fetch a specific podcast trailer by its identifier
 */
export function usePodcastTrailer(identifier: string) {
  const { nostr } = useNostr();
  const creatorPubkeyHex = getCreatorPubkeyHex();

  return useQuery<PodcastTrailer | null>({
    queryKey: ['podcast-trailer', identifier],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(1500)]);
      
      // Query for specific trailer by identifier
      const events = await nostr.query([{
        kinds: [PODCAST_KINDS.TRAILER],
        authors: [creatorPubkeyHex],
        '#d': [identifier],
        limit: 5
      }], { signal });

      if (events.length === 0) {
        return null;
      }

      // Get the most recent version
      const latestEvent = events
        .filter(validatePodcastTrailer)
        .reduce((latest, current) => 
          current.created_at > latest.created_at ? current : latest
        );

      return eventToPodcastTrailer(latestEvent);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
}
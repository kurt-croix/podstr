import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { PodcastEpisode, EpisodeSearchOptions, EpisodeValue } from '@/types/podcast';
import { getCreatorPubkeyHex, PODCAST_KINDS } from '@/lib/podcastConfig';
import { extractZapAmount, validateZapEvent } from '@/lib/zapUtils';

/** Episode d-tag identifiers to hide from the UI (test/duplicate episodes) */
const HIDDEN_EPISODES = new Set([
  '135429e2-f5fd-46fa-a439-a3d8efe6e0b4', // Testing??
  '3d03305d-59be-4250-9122-b148569197c2', // Testing final?
  '1cce52da-32ba-4447-bf8f-76581e81ca85', // Testing final??
  '229f6eca-cf2d-4fce-88c3-12877acb2d86', // Testing final???
  'fec88cfe-c499-4314-a29b-bca2ade4c75c', // Testing final????
  '518b0c84-9973-41d8-b2cc-998d4e4804fe', // Testing final?????
  'b30e2457-244f-4d78-9a2d-10037253542d', // Commissioner's Meeting (dup)
  '9a430bef-49d2-4be7-9111-e214cb2397a4', // Commissioner's Meeting (dup)
  '39e3d650-7410-42e6-aa7b-bf674aa3d572', // Commissioner's Meeting (dup)
  '2799d33d-28a5-408c-a1b6-609d45ed8e0d', // Commissioner's Meeting (dup)
  'd4de22be-8d87-46d7-aa50-83475a454248', // Untitled
  '994031fc-f00f-43d6-bc57-54c7f1353aad', // Untitled
  '2618edaf-a281-4718-9f6a-2cbd86e70496', // Untitled
  'episode-1773089043233-ppjyx0f99', // Test
  'episode-1773089770025-xe7ioudet', // Commissioners Meeting: March 4 (test)
  '65fae244-4478-41b8-beaf-fca3f345aa60', // Ray County 3/19 (dup)
  'fd9955bc-92a7-43fc-a8e9-877175cd42ae', // Commissioner's Meeting (wrong date)
]);

/** Extended options for episode fetching with performance controls */
interface ExtendedEpisodeSearchOptions extends EpisodeSearchOptions {
  /** Skip fetching zap data for better performance (default: false) */
  skipZaps?: boolean;
  /** Cursor for pagination - fetch episodes before this timestamp */
  until?: number;
}

/**
 * Validates if a Nostr event is a valid podcast episode (NIP-54)
 */
function validatePodcastEpisode(event: NostrEvent): boolean {
  if (event.kind !== PODCAST_KINDS.EPISODE) return false;

  // Check for required title tag (NIP-54)
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  if (!title) return false;

  // Check for required audio tag (NIP-54)
  const audio = event.tags.find(([name]) => name === 'audio')?.[1];
  if (!audio) return false;

  // Verify it's from the podcast creator
  if (event.pubkey !== getCreatorPubkeyHex()) return false;

  return true;
}

/**
 * Checks if an event is an edit of another event
 */
function isEditEvent(event: NostrEvent): boolean {
  return event.tags.some(([name]) => name === 'edit');
}

/**
 * Gets the original event ID from an edit event
 */
function getOriginalEventId(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'edit')?.[1];
}

/**
 * Fetch livestream start times from Nostr relays
 * Returns a map of `pubkey:dTag → starts timestamp`
 */
async function fetchLivestreamStarts(nostr: { query: (filters: NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]> }, events: NostrEvent[], signal: AbortSignal): Promise<Map<string, number>> {
  const startsMap = new Map<string, number>();
  const livestreamPubkeys = new Set<string>();

  for (const event of events) {
    const lsTag = event.tags.find(([n]) => n === 'livestream')?.[1];
    if (lsTag) {
      const parts = lsTag.split(':');
      if (parts.length >= 3 && parts[0] === '30311') {
        livestreamPubkeys.add(parts[1]);
      }
    }
  }

  if (livestreamPubkeys.size === 0) return startsMap;

  try {
    const lsEvents = await nostr.query([{
      kinds: [30311],
      authors: Array.from(livestreamPubkeys),
      limit: 200,
    }], { signal });

    for (const event of lsEvents) {
      const dTag = event.tags.find(([n]) => n === 'd')?.[1];
      const starts = event.tags.find(([n]) => n === 'starts')?.[1];
      if (dTag && starts) {
        const key = `${event.pubkey}:${dTag}`;
        const ts = parseInt(starts, 10);
        const existing = startsMap.get(key);
        if (!existing || ts < existing) {
          startsMap.set(key, ts);
        }
      }
    }
  } catch {
    // Continue without livestream dates
  }

  return startsMap;
}

/**
 * Converts a validated Nostr event to a PodcastEpisode object
 */
function eventToPodcastEpisode(event: NostrEvent, livestreamStarts?: Map<string, number>): PodcastEpisode {
  const tags = new Map(event.tags.map(([key, ...values]) => [key, values]));

  const title = tags.get('title')?.[0] || 'Untitled Episode';
  const description = tags.get('description')?.[0];
  const imageUrl = tags.get('image')?.[0];

  // Extract audio URL and type from audio tag (NIP-54 format)
  const audioTag = tags.get('audio');
  const audioUrl = audioTag?.[0] || '';
  const audioType = audioTag?.[1] || 'audio/mpeg';

  // Extract video URL and type from video tag
  const videoTag = tags.get('video');
  const videoUrl = videoTag?.[0];
  const videoType = videoTag?.[1];

  // Extract all 't' tags for topics
  const topicTags = event.tags
    .filter(([name]) => name === 't')
    .map(([, value]) => value);

  // Extract identifier from 'd' tag (for addressable events)
  const identifier = tags.get('d')?.[0] || event.id; // Fallback to event ID for backward compatibility

  // Extract duration from tag
  const durationStr = tags.get('duration')?.[0];
  const duration = durationStr ? parseInt(durationStr, 10) : undefined;

  // Extract publication date: prefer pubdate tag, then livestream starts, then created_at
  const pubdateStr = tags.get('pubdate')?.[0];
  let publishDate: Date;

  let livestreamStart: number | undefined;
  if (livestreamStarts) {
    const livestreamTag = tags.get('livestream')?.[0];
    if (livestreamTag) {
      const parts = livestreamTag.split(':');
      if (parts.length >= 3 && parts[0] === '30311') {
        const key = `${parts[1]}:${parts[2]}`;
        livestreamStart = livestreamStarts.get(key);
      }
    }
  }

  try {
    if (pubdateStr) {
      publishDate = new Date(pubdateStr);
    } else if (livestreamStart) {
      publishDate = new Date(livestreamStart * 1000);
    } else {
      publishDate = new Date(event.created_at * 1000);
    }
  } catch {
    publishDate = new Date(event.created_at * 1000);
  }

  // Extract transcript URL from tag
  const transcriptUrl = tags.get('transcript')?.[0];

  // Extract chapters URL from tag
  const chaptersUrl = tags.get('chapters')?.[0];

  // Extract episode number from tag
  const episodeNumStr = tags.get('episode')?.[0];
  const episodeNumber = episodeNumStr ? parseInt(episodeNumStr, 10) : undefined;

  // Extract season number from tag
  const seasonNumStr = tags.get('season')?.[0];
  const seasonNumber = seasonNumStr ? parseInt(seasonNumStr, 10) : undefined;

  // Extract per-episode value splits from tag
  let value: EpisodeValue | undefined;
  const valueStr = tags.get('value')?.[0];
  if (valueStr) {
    try {
      value = JSON.parse(valueStr) as EpisodeValue;
    } catch {
      console.warn('Failed to parse episode value tag:', valueStr);
    }
  }

  // Content is just the show notes (plain text)
  const content = event.content || undefined;

  return {
    id: event.id,
    title,
    description,
    content,
    audioUrl,
    audioType,
    videoUrl,
    videoType,
    imageUrl,
    duration,
    episodeNumber,
    seasonNumber,
    publishDate,
    explicit: false, // Can be extended later if needed
    tags: topicTags,
    transcriptUrl,
    chaptersUrl,
    externalRefs: [],
    value,
    eventId: event.id,
    authorPubkey: event.pubkey,
    identifier,
    createdAt: new Date(event.created_at * 1000),
  };
}

/**
 * Hook to fetch all podcast episodes from the creator
 */
export function usePodcastEpisodes(options: ExtendedEpisodeSearchOptions = {}) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['podcast-episodes', options],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(15000)]);

      // Build query filter with optional cursor-based pagination
      const events = await nostr.query([{
        kinds: [PODCAST_KINDS.EPISODE],
        authors: [getCreatorPubkeyHex()],
        limit: options.limit || 50, // Fetch enough to cover all episodes after dedup
        ...(options.until ? { until: options.until } : {}),
      }], { signal });

      // Filter and validate events
      const validEvents = events.filter(validatePodcastEpisode);

      // Deduplicate by d-tag identifier (addressable events), matching RSS behavior
      const episodesByIdentifier = new Map<string, NostrEvent>();
      const originalEvents = new Set<string>();

      validEvents.forEach(event => {
        if (isEditEvent(event)) {
          const originalId = getOriginalEventId(event);
          if (originalId) originalEvents.add(originalId);
        }
      });

      validEvents.forEach(event => {
        if (originalEvents.has(event.id)) return;
        const identifier = event.tags.find(([n]) => n === 'd')?.[1];
        if (!identifier) return;
        const existing = episodesByIdentifier.get(identifier);
        if (!existing || event.created_at > existing.created_at) {
          episodesByIdentifier.set(identifier, event);
        }
      });

      // Fetch livestream start times for accurate publish dates (separate timeout)
      const dedupedEvents = Array.from(episodesByIdentifier.values());
      const lsSignal = AbortSignal.timeout(8000);
      const livestreamStarts = await fetchLivestreamStarts(nostr, dedupedEvents, lsSignal);

      // Convert to podcast episodes and filter hidden ones
      const validEpisodes = dedupedEvents
        .map(e => eventToPodcastEpisode(e, livestreamStarts))
        .filter(ep => !HIDDEN_EPISODES.has(ep.identifier));

      // Fetch zap data for all episodes in a single query (optional for performance)
      const episodeIds = validEpisodes.map(ep => ep.eventId);

      const zapData: Map<string, { count: number; totalSats: number }> = new Map();

      // Only fetch zaps if not explicitly skipped (for performance)
      if (!options.skipZaps && episodeIds.length > 0) {
        try {
          // Query for all zaps to these episodes
          const zapEvents = await nostr.query([{
            kinds: [9735], // Zap receipts
            '#e': episodeIds, // Episodes being zapped
            limit: 500 // Reduced from 2000 - fetch more incrementally if needed
          }], { signal });

          // Process zap events and group by episode
          const validZaps = zapEvents.filter(validateZapEvent);

          validZaps.forEach(zapEvent => {
            const episodeId = zapEvent.tags.find(([name]) => name === 'e')?.[1];
            if (!episodeId) return;

            const amount = extractZapAmount(zapEvent);
            const existing = zapData.get(episodeId) || { count: 0, totalSats: 0 };

            zapData.set(episodeId, {
              count: existing.count + 1,
              totalSats: existing.totalSats + amount
            });
          });
        } catch (error) {
          console.warn('Failed to fetch zap data for episodes:', error);
          // Continue without zap data rather than failing completely
        }
      }

      // Add zap counts to episodes
      const episodesWithZaps = validEpisodes.map(episode => {
        const zaps = zapData.get(episode.eventId);
        return {
          ...episode,
          ...(zaps && zaps.count > 0 ? { zapCount: zaps.count } : {}),
          ...(zaps && zaps.totalSats > 0 ? { totalSats: zaps.totalSats } : {})
        };
      });


      // Apply search filtering
      let filteredEpisodes = episodesWithZaps;

      if (options.query) {
        const query = options.query.toLowerCase();
        filteredEpisodes = filteredEpisodes.filter(episode =>
          episode.title.toLowerCase().includes(query) ||
          episode.description?.toLowerCase().includes(query) ||
          episode.content?.toLowerCase().includes(query)
        );
      }

      if (options.tags && options.tags.length > 0) {
        filteredEpisodes = filteredEpisodes.filter(episode =>
          options.tags!.some(tag => episode.tags.includes(tag))
        );
      }

      // Apply sorting
      const sortBy = options.sortBy || 'date';
      const sortOrder = options.sortOrder || 'desc';

      filteredEpisodes.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'date':
            comparison = a.publishDate.getTime() - b.publishDate.getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'zaps':
            comparison = (a.zapCount || 0) - (b.zapCount || 0);
            break;
          case 'comments':
            comparison = (a.commentCount || 0) - (b.commentCount || 0);
            break;
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Apply offset
      if (options.offset) {
        filteredEpisodes = filteredEpisodes.slice(options.offset);
      }

      return filteredEpisodes;
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch a single podcast episode by ID
 */
export function usePodcastEpisode(episodeId: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['podcast-episode', episodeId],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query([{
        ids: [episodeId]
      }], { signal });

      const event = events[0];
      if (!event || !validatePodcastEpisode(event)) {
        return null;
      }

      return eventToPodcastEpisode(event);
    },
    enabled: !!episodeId,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to get the latest episode
 * Optimized to fetch only the most recent episode for better performance
 */
export function useLatestEpisode() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['podcast-episode-latest'],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(5000)]);

      // Episodes have pubdate tags — no need for livestream starts query
      const events = await nostr.query([{
        kinds: [PODCAST_KINDS.EPISODE],
        authors: [getCreatorPubkeyHex()],
        limit: 10, // Only need 1, 10 covers hidden test episodes
      }], { signal });

      // Filter and validate events
      const validEvents = events.filter(validatePodcastEpisode);

      // Filter hidden episodes
      const visibleEvents = validEvents.filter(event => {
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        return !dTag || !HIDDEN_EPISODES.has(dTag);
      });

      if (visibleEvents.length === 0) return null;

      // Handle deduplication for the small set
      const originalEvents = new Set<string>();
      visibleEvents.forEach(event => {
        if (isEditEvent(event)) {
          const originalId = getOriginalEventId(event);
          if (originalId) originalEvents.add(originalId);
        }
      });

      const candidates = visibleEvents.filter(e => !originalEvents.has(e.id));

      // Use pubdate tags directly — no livestream starts query needed
      // Find the latest valid episode
      let latestEvent: NostrEvent | null = null;
      let latestPubdate = 0;

      for (const event of candidates) {
        const ep = eventToPodcastEpisode(event);
        if (ep.publishDate.getTime() > latestPubdate) {
          latestEvent = event;
          latestPubdate = ep.publishDate.getTime();
        }
      }

      return latestEvent ? eventToPodcastEpisode(latestEvent) : null;
    },
    staleTime: 180000, // 3 minutes — episodes don't change frequently
  });
}

/** Page size for infinite scroll */
const EPISODES_PER_PAGE = 10;

/**
 * Hook for infinite scroll episode loading
 * Returns episodes in pages with cursor-based pagination
 */
export function useInfiniteEpisodes(options: Omit<ExtendedEpisodeSearchOptions, 'until' | 'offset'> = {}) {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['podcast-episodes-infinite', options],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(5000)]);
      const limit = options.limit || EPISODES_PER_PAGE;

      // Fetch episodes with cursor
      // Use generous limit to ensure all episodes are fetched even when many
      // hidden/test episodes exist with the same created_at timestamp
      const events = await nostr.query([{
        kinds: [PODCAST_KINDS.EPISODE],
        authors: [getCreatorPubkeyHex()],
        limit: Math.max(limit + 5, 50),
        ...(pageParam ? { until: pageParam } : {}),
      }], { signal });

      // Filter and validate events
      const validEvents = events.filter(validatePodcastEpisode);

      // Deduplicate episodes by identifier (d tag)
      const episodesByIdentifier = new Map<string, NostrEvent>();
      const originalEvents = new Set<string>();

      // First pass: identify edited events and their originals
      validEvents.forEach(event => {
        if (isEditEvent(event)) {
          const originalId = getOriginalEventId(event);
          if (originalId) originalEvents.add(originalId);
        }
      });

      // Second pass: select the best version for each identifier
      validEvents.forEach(event => {
        if (originalEvents.has(event.id)) return;

        const identifier = event.tags.find(([name]) => name === 'd')?.[1] || event.id;
        const existing = episodesByIdentifier.get(identifier);

        if (!existing || event.created_at > existing.created_at) {
          episodesByIdentifier.set(identifier, event);
        }
      });

      // Use pubdate tags directly — no livestream starts query needed
      const dedupedInfinite = Array.from(episodesByIdentifier.values());

      // Convert to podcast episodes and filter hidden ones
      const episodes = dedupedInfinite
        .map(e => eventToPodcastEpisode(e))
        .filter(ep => !HIDDEN_EPISODES.has(ep.identifier));

      // Sort by publishDate descending
      episodes.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());

      // Trim to requested limit
      const trimmedEpisodes = episodes.slice(0, limit);

      // Apply search filtering if specified
      let filteredEpisodes = trimmedEpisodes;

      if (options.query) {
        const query = options.query.toLowerCase();
        filteredEpisodes = filteredEpisodes.filter(episode =>
          episode.title.toLowerCase().includes(query) ||
          episode.description?.toLowerCase().includes(query) ||
          episode.content?.toLowerCase().includes(query)
        );
      }

      if (options.tags && options.tags.length > 0) {
        filteredEpisodes = filteredEpisodes.filter(episode =>
          options.tags!.some(tag => episode.tags.includes(tag))
        );
      }

      // Fetch zap data if not skipped
      if (!options.skipZaps && filteredEpisodes.length > 0) {
        const episodeIds = filteredEpisodes.map(ep => ep.eventId);
        try {
          const zapEvents = await nostr.query([{
            kinds: [9735],
            '#e': episodeIds,
            limit: 200
          }], { signal });

          const validZaps = zapEvents.filter(validateZapEvent);
          const zapData = new Map<string, { count: number; totalSats: number }>();

          validZaps.forEach(zapEvent => {
            const episodeId = zapEvent.tags.find(([name]) => name === 'e')?.[1];
            if (!episodeId) return;

            const amount = extractZapAmount(zapEvent);
            const existing = zapData.get(episodeId) || { count: 0, totalSats: 0 };
            zapData.set(episodeId, {
              count: existing.count + 1,
              totalSats: existing.totalSats + amount
            });
          });

          filteredEpisodes = filteredEpisodes.map(episode => ({
            ...episode,
            ...(zapData.get(episode.eventId) || {})
          }));
        } catch (error) {
          console.warn('Failed to fetch zap data:', error);
        }
      }

      // Determine cursor for next page
      // Use the oldest episode's created_at timestamp minus 1 to avoid duplicates
      const oldestEvent = events.length > 0 
        ? events.reduce((oldest, e) => e.created_at < oldest.created_at ? e : oldest)
        : null;
      const nextCursor = oldestEvent && events.length >= limit 
        ? oldestEvent.created_at - 1 
        : undefined;

      return {
        episodes: filteredEpisodes,
        nextCursor,
        hasMore: !!nextCursor && filteredEpisodes.length >= limit,
      };
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 180000, // 3 minutes
  });
}

/**
 * Hook to get podcast statistics
 */
export function usePodcastStats() {
  const { data: episodes } = usePodcastEpisodes();

  return useQuery({
    queryKey: ['podcast-stats', episodes?.length],
    queryFn: async () => {
      if (!episodes) return null;

      const totalEpisodes = episodes.length;
      const totalZaps = episodes.reduce((sum, ep) => sum + (ep.zapCount || 0), 0);
      const totalComments = episodes.reduce((sum, ep) => sum + (ep.commentCount || 0), 0);
      const totalReposts = episodes.reduce((sum, ep) => sum + (ep.repostCount || 0), 0);

      const mostZappedEpisode = episodes.reduce((max, ep) =>
        (ep.zapCount || 0) > (max?.zapCount || 0) ? ep : max, episodes[0]
      );

      const mostCommentedEpisode = episodes.reduce((max, ep) =>
        (ep.commentCount || 0) > (max?.commentCount || 0) ? ep : max, episodes[0]
      );

      return {
        totalEpisodes,
        totalZaps,
        totalComments,
        totalReposts,
        mostZappedEpisode: mostZappedEpisode?.zapCount ? mostZappedEpisode : undefined,
        mostCommentedEpisode: mostCommentedEpisode?.commentCount ? mostCommentedEpisode : undefined,
        recentEngagement: [] // TODO: Implement recent engagement tracking
      };
    },
    enabled: !!episodes,
    staleTime: 300000, // 5 minutes
  });
}
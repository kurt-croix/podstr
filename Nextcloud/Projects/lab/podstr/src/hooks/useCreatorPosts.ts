import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getCreatorPubkeyHex } from '@/lib/podcastConfig';

/**
 * Hook to fetch the creator's social posts (kind 1 text notes) with infinite scroll
 */
export function useCreatorPosts(limit: number = 20) {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['creator-posts'],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.any([AbortSignal.timeout(10000)]);

      // Query for text notes (kind 1) from the creator
      const events = await nostr.query([{
        kinds: [1], // Text notes
        authors: [getCreatorPubkeyHex()],
        limit: limit * 2, // Get more to filter out replies
        until: pageParam, // Use until for pagination
      }], { signal });

      // Filter out replies (events that have 'e' tags) to only show root notes
      const rootNotes = events.filter(event =>
        !event.tags.some(tag => tag[0] === 'e')
      );

      // Sort by creation time (most recent first)
      return rootNotes.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer results than requested, we've reached the end
      if (lastPage.length < limit) return undefined;

      // If no posts were returned, we've reached the end
      if (lastPage.length === 0) return undefined;

      // Get the oldest timestamp from this page
      const oldestTimestamp = lastPage[lastPage.length - 1].created_at;

      // To prevent infinite loops, check if we're getting the same timestamp
      // This can happen when there are very few posts
      const allTimestamps = allPages.flat().map(event => event.created_at);
      if (allTimestamps.includes(oldestTimestamp)) {
        // We've seen this timestamp before, likely no more unique posts
        return undefined;
      }

      return oldestTimestamp;
    },
    staleTime: 10000, // 10 seconds - more aggressive refresh for creator posts
  });
}

/**
 * Hook to fetch the creator's reposts (kind 6 and 16)
 */
export function useCreatorReposts(limit: number = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['creator-reposts', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);

      // Query for both legacy (kind 6) and generic (kind 16) reposts from the creator
      const events = await nostr.query([{
        kinds: [6, 16], // Legacy reposts and generic reposts
        authors: [getCreatorPubkeyHex()],
        limit: limit
      }], { signal });

      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch creator's social activity (posts + reposts combined)
 */
export function useCreatorActivity(limit: number = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['creator-activity', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);

      // Query for multiple kinds from the creator
      const events = await nostr.query([{
        kinds: [1, 6, 16, 7], // Text notes, legacy reposts, generic reposts, reactions
        authors: [getCreatorPubkeyHex()],
        limit: limit * 2 // Get more to ensure we have enough after filtering
      }], { signal });

      // Sort by creation time and limit results
      return events
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit);
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch replies to the creator's posts (excluding creator's own replies)
 */
export function useRepliesToCreator(limit: number = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['replies-to-creator', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);

      // First get creator's posts to find their event IDs
      const creatorPosts = await nostr.query([{
        kinds: [1], // Only text notes
        authors: [getCreatorPubkeyHex()],
        limit: 100 // Get more posts to find replies to
      }], { signal });

      if (creatorPosts.length === 0) {
        return [];
      }

      // Get the event IDs to search for replies
      const creatorEventIds = creatorPosts.map(event => event.id);

      // Query for replies that reference the creator's posts
      const replies = await nostr.query([{
        kinds: [1], // Text notes (replies)
        '#e': creatorEventIds, // References to creator's events
        limit: limit * 2
      }], { signal });

      // Filter out the creator's own posts and sort by creation time
      return replies
        .filter(reply => reply.pubkey !== getCreatorPubkeyHex())
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit);
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch creator's replies and the original notes they replied to with infinite scroll
 */
export function useCreatorRepliesWithContext(limit: number = 20) {
  const { nostr } = useNostr();

  return useInfiniteQuery({
    queryKey: ['creator-replies-with-context'],
    queryFn: async ({ pageParam }) => {
      const signal = AbortSignal.any([AbortSignal.timeout(10000)]);

      // Get creator's replies (posts that have 'e' tags - indicating they're replies)
      const creatorReplies = await nostr.query([{
        kinds: [1], // Text notes
        authors: [getCreatorPubkeyHex()],
        limit: limit * 2,
        until: pageParam, // Use until for pagination
      }], { signal });

      // Filter to only get actual replies (posts with 'e' tags)
      const actualReplies = creatorReplies.filter(reply =>
        reply.tags.some(tag => tag[0] === 'e')
      );

      if (actualReplies.length === 0) {
        return [];
      }

      // Get the event IDs that the creator replied to
      const repliedToEventIds = actualReplies
        .map(reply => reply.tags.find(tag => tag[0] === 'e')?.[1])
        .filter((id): id is string => Boolean(id));

      // Fetch the original events that creator replied to
      const originalEvents = await nostr.query([{
        ids: repliedToEventIds
      }], { signal });

      // Create a map of original events for easy lookup
      const originalEventsMap = new Map(
        originalEvents.map(event => [event.id, event])
      );

      // Combine replies with their original events, sort by reply creation time
      const repliesWithContext = actualReplies
        .map(reply => {
          const originalEventId = reply.tags.find(tag => tag[0] === 'e')?.[1];
          const originalEvent = originalEventId ? originalEventsMap.get(originalEventId) : undefined;

          return {
            reply,
            originalEvent,
            // Use reply timestamp for sorting since that's when creator participated
            timestamp: reply.created_at
          };
        })
        .filter(item => item.originalEvent) // Only include if we found the original
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      // Flatten to include both original and reply events for rendering
      const result: typeof originalEvents = [];
      for (const { reply, originalEvent } of repliesWithContext) {
        if (originalEvent) {
          // Add original event first, then the reply
          result.push(originalEvent, reply);
        }
      }

      return result;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer results than expected, we've reached the end
      if (lastPage.length === 0) return undefined;

      // Find the oldest reply timestamp for pagination
      const replyEvents = lastPage.filter((event, index) => index % 2 === 1); // Replies are at odd indices
      if (replyEvents.length === 0) return undefined;

      const oldestTimestamp = Math.min(...replyEvents.map(e => e.created_at));

      // To prevent infinite loops, check if we're getting the same timestamp
      const allReplyTimestamps = allPages
        .flat()
        .filter((event, index) => index % 2 === 1) // Get all reply events
        .map(event => event.created_at);

      if (allReplyTimestamps.includes(oldestTimestamp)) {
        // We've seen this timestamp before, likely no more unique replies
        return undefined;
      }

      return oldestTimestamp;
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch creator's notes only (no reposts)
 */
export function useCreatorNotes(limit: number = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['creator-notes', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);

      // Query for text notes only from the creator
      const events = await nostr.query([{
        kinds: [1], // Only text notes
        authors: [getCreatorPubkeyHex()],
        limit: limit
      }], { signal });

      // Filter out replies (notes with 'e' tags) to show only root notes
      const rootNotes = events.filter(event =>
        !event.tags.some(tag => tag[0] === 'e')
      );

      return rootNotes.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook for Replies tab - shows only creator's replies with original context (Twitter style)
 * Each reply shows: Original note + Creator's reply
 */
export function useCreatorRepliesTab(limit: number = 50) {
  return useCreatorRepliesWithContext(limit);
}
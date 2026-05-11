import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { getCreatorPubkeyHex, PODCAST_KINDS } from '@/lib/podcastConfig';
import { genRSSFeed } from '@/lib/rssGenerator';
import type { PodcastEpisode } from '@/types/podcast';
import type { NostrEvent } from '@nostrify/nostrify';

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
 * Converts a validated Nostr event to a PodcastEpisode object
 */
function eventToPodcastEpisode(event: NostrEvent): PodcastEpisode {
  const tags = new Map(event.tags.map(([key, ...values]) => [key, values]));

  const title = tags.get('title')?.[0] || 'Untitled Episode';
  const description = tags.get('description')?.[0];
  const imageUrl = tags.get('image')?.[0];

  // Extract audio URL and type from audio tag (NIP-54 format)
  const audioTag = tags.get('audio');
  const audioUrl = audioTag?.[0] || '';
  const audioType = audioTag?.[1] || 'audio/mpeg';

  // Extract all 't' tags for topics
  const topicTags = event.tags
    .filter(([name]) => name === 't')
    .map(([, value]) => value);

  // Extract identifier from 'd' tag (for addressable events)
  const identifier = tags.get('d')?.[0] || event.id; // Fallback to event ID for backward compatibility

  return {
    id: event.id,
    title,
    description,
    content: event.content || undefined,
    audioUrl,
    audioType,
    imageUrl,
    duration: undefined, // Can be extended later if needed
    episodeNumber: undefined, // Can be extended later if needed
    seasonNumber: undefined, // Can be extended later if needed
    publishDate: new Date(event.created_at * 1000),
    explicit: false, // Can be extended later if needed
    tags: topicTags,
    externalRefs: [],
    eventId: event.id,
    authorPubkey: event.pubkey,
    identifier,
    createdAt: new Date(event.created_at * 1000),
  };
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
 * Hook to fetch podcast episodes and generate RSS feed
 */
export function useRSSFeedGenerator() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['rss-feed-generator'],
    queryFn: async () => {
      try {
        // Fetch podcast episodes (kind 54 for NIP-54 podcast episodes)
        const events = await nostr.query([
          {
            kinds: [PODCAST_KINDS.EPISODE],
            authors: [getCreatorPubkeyHex()],
            limit: 100,
          }
        ]);

        // Filter and validate events
        const validEvents = events.filter(validatePodcastEpisode);

        // Deduplicate episodes by title - keep only the latest version of each title
        const episodesByTitle = new Map<string, NostrEvent>();
        const originalEvents = new Set<string>(); // Track original events that have been edited

        // First pass: identify edited events and their originals
        validEvents.forEach(event => {
          if (isEditEvent(event)) {
            const originalId = getOriginalEventId(event);
            if (originalId) {
              originalEvents.add(originalId);
            }
          }
        });

        // Second pass: select the best version for each title
        validEvents.forEach(event => {
          const title = event.tags.find(([name]) => name === 'title')?.[1] || '';
          if (!title) return;

          // Skip if this is an original event that has been edited
          if (originalEvents.has(event.id)) return;

          const existing = episodesByTitle.get(title);
          if (!existing || event.created_at > existing.created_at) {
            episodesByTitle.set(title, event);
          }
        });

        // Convert to podcast episodes
        const episodes = Array.from(episodesByTitle.values()).map(eventToPodcastEpisode);

        // Sort by publish date (newest first for RSS)
        episodes.sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());

        // Generate RSS feed with the current configuration and episodes
        await genRSSFeed(episodes);

        return {
          episodes,
          rssGenerated: true,
          lastGenerated: new Date(),
        };
      } catch (error) {
        console.error('Failed to generate RSS feed:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
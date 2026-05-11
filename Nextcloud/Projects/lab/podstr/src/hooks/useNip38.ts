
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePodcastMetadata } from '@/hooks/usePodcastMetadata';
import { encodeEventIdAsNevent } from '@/lib/nip19Utils';
import type { PodcastEpisode } from '@/types/podcast';

/**
 * Hook to update now playing status using NIP-38 User Status events
 * Publishes podcast episode status updates that appear next to usernames
 */
/**
 * Get the current website URL for the nevent link
 */
function getCurrentSiteUrl(): string {
  // Use current browser origin for the nevent link
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  
  // Fallback for SSR or non-browser environments
  return 'https://podstr.com';
}

export function useUpdateNowPlaying() {
  const { mutate: createEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({ 
      episode, 
      podcastName
    }: {
      episode: PodcastEpisode;
      podcastName?: string;
    }) => {
      // Use provided podcast name or fall back to extracting from episode tags
      const finalPodcastName = podcastName || 
        episode.tags.find(tag => tag.startsWith('podcast:'))?.replace('podcast:', '') || 
        'Podcast';
      
      // Format content as "Episode Title - Podcast Name"
      const content = `${episode.title} - ${finalPodcastName}`;
      
      // Calculate expiration based on episode duration (if available)
      // Default to 2 hours if no duration specified
      const durationSeconds = episode.duration || 7200; // 2 hours default
      const expiration = Math.floor(Date.now() / 1000) + durationSeconds;

      // Generate nevent URL for the episode
      const nevent = encodeEventIdAsNevent(episode.eventId, episode.authorPubkey);
      const episodeUrl = `${getCurrentSiteUrl()}/${nevent}`;

      createEvent({
        kind: 30315, // NIP-38 User Status
        content,
        tags: [
          ['d', 'music'], // Status type identifier - using 'music' for compatibility with existing clients
          ['r', episodeUrl], // Reference link to the episode using nevent format
          ['expiration', expiration.toString()], // Auto-clear when episode should be finished
          ['alt', `Currently listening to podcast episode: ${content}`], // NIP-31 alt tag for accessibility
        ],
      });
    },
  });
}

/**
 * Hook to clear the now playing status
 * Publishes an empty status to clear the current podcast status
 */
export function useClearNowPlaying() {
  const { mutate: createEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async () => {
      createEvent({
        kind: 30315, // NIP-38 User Status
        content: '', // Empty content clears the status
        tags: [
          ['d', 'music'], // Status type identifier - using 'music' for compatibility with existing clients
          ['alt', 'Cleared podcast listening status'], // NIP-31 alt tag
        ],
      });
    },
  });
}

/**
 * Hook that automatically manages NIP-38 status updates based on audio player state
 * Only publishes once per episode to avoid spam, and gets proper podcast name from metadata
 */
export function useNip38() {
  const { state } = useAudioPlayer();
  const { user } = useCurrentUser();
  const { data: podcastMetadata } = usePodcastMetadata();
  const { mutateAsync: updateNowPlaying } = useUpdateNowPlaying();
  const { mutateAsync: clearNowPlaying } = useClearNowPlaying();
  
  // Track the last published episode to avoid spam
  const lastPublishedEpisodeRef = useRef<string | null>(null);
  const lastPlayingStateRef = useRef<boolean>(false);
  const hasStatusClearedRef = useRef<boolean>(false);

  const { currentEpisode, isPlaying } = state;

  useEffect(() => {
    if (!user) return;

    const episodeId = currentEpisode?.eventId;
    const wasPlaying = lastPlayingStateRef.current;
    
    // Update the playing state ref
    lastPlayingStateRef.current = isPlaying;

    if (isPlaying && currentEpisode) {
      // Reset clear status flag when starting to play
      hasStatusClearedRef.current = false;
      
      // Only publish if this is a new episode or we weren't playing before
      if (lastPublishedEpisodeRef.current !== episodeId || !wasPlaying) {
        const podcastName = podcastMetadata?.title || 'Unknown Podcast';
        
        updateNowPlaying({
          episode: currentEpisode,
          podcastName
          // websiteUrl is now auto-detected, no need to hardcode
        }).then(() => {
          // Mark this episode as published
          lastPublishedEpisodeRef.current = episodeId || null;
          console.log(`Published NIP-38 status for: ${currentEpisode.title} - ${podcastName}`);
        }).catch(error => {
          console.error('Failed to update now playing status:', error);
        });
      }
    } else if (wasPlaying && !isPlaying && !hasStatusClearedRef.current && lastPublishedEpisodeRef.current) {
      // Only clear once when transitioning from playing to not playing
      // And only if we haven't already cleared for this session
      hasStatusClearedRef.current = true;
      
      clearNowPlaying().then(() => {
        console.log('Cleared NIP-38 status after playback ended');
      }).catch(error => {
        console.error('Failed to clear now playing status:', error);
      });
    }
  }, [isPlaying, currentEpisode?.eventId, currentEpisode, user, podcastMetadata?.title, updateNowPlaying, clearNowPlaying]);

  // Clear status when component unmounts 
  useEffect(() => {
    return () => {
      // Clear on unmount only if we published something and haven't already cleared
      if (user && lastPublishedEpisodeRef.current && !hasStatusClearedRef.current) {
        clearNowPlaying().catch(error => {
          console.error('Failed to clear now playing status on unmount:', error);
        });
      }
    };
  }, [user, clearNowPlaying]);

  // Reset tracking when episode changes
  useEffect(() => {
    if (currentEpisode?.eventId && lastPublishedEpisodeRef.current && 
        lastPublishedEpisodeRef.current !== currentEpisode.eventId) {
      // Episode changed, reset tracking so new episode can be published
      lastPublishedEpisodeRef.current = null;
      hasStatusClearedRef.current = false;
    }
  }, [currentEpisode?.eventId]);
}

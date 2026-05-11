import { usePodcastMetadata } from './usePodcastMetadata';
import { PODCAST_CONFIG } from '@/lib/podcastConfig';

export function usePodcastConfig() {
  const { data: podcastMetadata } = usePodcastMetadata();

  // Return dynamic config if metadata exists, otherwise fallback to hardcoded config
  const config = podcastMetadata ? {
    ...PODCAST_CONFIG,
    podcast: {
      ...PODCAST_CONFIG.podcast,
      ...podcastMetadata
    }
  } : PODCAST_CONFIG;

  return config;
}
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { PODCAST_KINDS, getCreatorPubkeyHex } from '@/lib/podcastConfig';
import { usePodcastEpisodes } from '@/hooks/usePodcastEpisodes';
import { usePodcastTrailers } from '@/hooks/usePodcastTrailers';
import type { PodcastEpisode } from '@/types/podcast';

interface PodcastAnalytics {
  totalEpisodes: number;
  totalTrailers: number;
  totalZaps: number;
  totalComments: number;
  totalReposts: number;
  topEpisodes: Array<{
    episode: PodcastEpisode;
    zaps: number;
    comments: number;
    reposts: number;
    totalEngagement: number;
  }>;
  recentActivity: Array<{
    type: 'zap' | 'comment' | 'repost';
    episodeId: string;
    episodeTitle: string;
    timestamp: Date;
    amount?: number; // for zaps
    author?: string; // for comments/reposts
  }>;
  engagementOverTime: Array<{
    date: string;
    zaps: number;
    comments: number;
    reposts: number;
  }>;
}

/**
 * Comprehensive analytics hook for podcast performance tracking
 */
export function usePodcastAnalytics() {
  const { nostr } = useNostr();
  const creatorPubkeyHex = getCreatorPubkeyHex();
  const { data: episodes } = usePodcastEpisodes();
  const { data: trailers } = usePodcastTrailers();

  return useQuery<PodcastAnalytics>({
    queryKey: ['podcast-analytics', creatorPubkeyHex],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(5000)]);

      if (!episodes || episodes.length === 0) {
        // Return empty analytics if no episodes
        return {
          totalEpisodes: 0,
          totalTrailers: trailers?.length || 0,
          totalZaps: 0,
          totalComments: 0,
          totalReposts: 0,
          topEpisodes: [],
          recentActivity: [],
          engagementOverTime: [],
        };
      }

      // Get all episode event IDs for filtering
      const episodeEventIds = episodes.map(ep => ep.eventId);

      // Fetch all engagement events in parallel
      const [zapEvents, commentEvents, repostEvents] = await Promise.all([
        // Zaps (kind 9735) targeting our episodes
        nostr.query([{
          kinds: [9735],
          '#e': episodeEventIds,
          limit: 1000
        }], { signal }).catch(() => []),

        // Comments (kind 1111) targeting our episodes  
        nostr.query([{
          kinds: [PODCAST_KINDS.COMMENT],
          '#e': episodeEventIds,
          limit: 1000
        }], { signal }).catch(() => []),

        // Reposts (kind 6 and 16) targeting our episodes
        nostr.query([{
          kinds: [6, 16],
          '#e': episodeEventIds,
          limit: 1000
        }], { signal }).catch(() => []),
      ]);

      // Calculate totals
      const totalZaps = zapEvents.length;
      const totalComments = commentEvents.length;
      const totalReposts = repostEvents.length;

      // Calculate per-episode engagement
      const episodeEngagement = episodes.map(episode => {
        const episodeZaps = zapEvents.filter(e => 
          e.tags.some(([name, value]) => name === 'e' && value === episode.eventId)
        );
        const episodeComments = commentEvents.filter(e =>
          e.tags.some(([name, value]) => name === 'e' && value === episode.eventId)  
        );
        const episodeReposts = repostEvents.filter(e =>
          e.tags.some(([name, value]) => name === 'e' && value === episode.eventId)
        );

        return {
          episode,
          zaps: episodeZaps.length,
          comments: episodeComments.length,
          reposts: episodeReposts.length,
          totalEngagement: episodeZaps.length + episodeComments.length + episodeReposts.length
        };
      });

      // Sort episodes by engagement
      const topEpisodes = episodeEngagement
        .sort((a, b) => b.totalEngagement - a.totalEngagement)
        .slice(0, 5);

      // Create recent activity feed
      const allActivity = [
        ...zapEvents.map(event => ({
          type: 'zap' as const,
          event,
          timestamp: new Date(event.created_at * 1000),
        })),
        ...commentEvents.map(event => ({
          type: 'comment' as const,
          event,
          timestamp: new Date(event.created_at * 1000),
        })),
        ...repostEvents.map(event => ({
          type: 'repost' as const, 
          event,
          timestamp: new Date(event.created_at * 1000),
        })),
      ];

      // Sort by recency and map to activity format
      const recentActivity = allActivity
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 10)
        .map(activity => {
          const episodeId = activity.event.tags.find(([name]) => name === 'e')?.[1] || '';
          const episode = episodes.find(ep => ep.eventId === episodeId);

          return {
            type: activity.type,
            episodeId,
            episodeTitle: episode?.title || 'Unknown Episode',
            timestamp: activity.timestamp,
            author: activity.event.pubkey.slice(0, 8) + '...',
          };
        });

      // Engagement over time (last 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const dailyEngagement = new Map<string, {zaps: number, comments: number, reposts: number}>();

      // Initialize last 30 days
      for (let i = 0; i < 30; i++) {
        const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
        const dateKey = date.toISOString().split('T')[0];
        dailyEngagement.set(dateKey, { zaps: 0, comments: 0, reposts: 0 });
      }

      // Count engagement by day
      [...zapEvents, ...commentEvents, ...repostEvents].forEach(event => {
        if (event.created_at * 1000 >= thirtyDaysAgo) {
          const date = new Date(event.created_at * 1000);
          const dateKey = date.toISOString().split('T')[0];
          const dayData = dailyEngagement.get(dateKey);
          
          if (dayData) {
            if (event.kind === 9735) dayData.zaps++;
            else if (event.kind === 1111) dayData.comments++;
            else if ([6, 16].includes(event.kind)) dayData.reposts++;
          }
        }
      });

      const engagementOverTime = Array.from(dailyEngagement.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalEpisodes: episodes.length,
        totalTrailers: trailers?.length || 0,
        totalZaps,
        totalComments,
        totalReposts,
        topEpisodes,
        recentActivity,
        engagementOverTime,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    enabled: !!episodes, // Only run when episodes are loaded
  });
}

/**
 * Lightweight analytics hook for quick stats (used in About page)
 */
export function usePodcastQuickStats() {
  const analytics = usePodcastAnalytics();

  return {
    data: analytics.data ? {
      totalEpisodes: analytics.data.totalEpisodes,
      totalZaps: analytics.data.totalZaps,
      totalComments: analytics.data.totalComments,
      totalReposts: analytics.data.totalReposts,
      mostEngagedEpisode: analytics.data.topEpisodes[0]?.episode || null,
    } : null,
    isLoading: analytics.isLoading,
    error: analytics.error,
  };
}
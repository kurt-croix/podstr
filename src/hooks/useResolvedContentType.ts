import { useMemo } from 'react';
import { useLatestEpisode } from '@/hooks/usePodcastEpisodes';
import { useArticles } from '@/hooks/useArticles';
import { useCreatorNotes } from '@/hooks/useCreatorPosts';
import type { SectionContentType } from '@/contexts/AppContext';

type ConcreteType = 'episode' | 'article' | 'post';

/**
 * Given a SectionContentType config value, resolves 'auto' to whichever
 * content type has the most recent item. Returns the concrete type.
 */
export function useResolvedContentType(configValue: SectionContentType): {
  resolvedType: ConcreteType;
} {
  const { data: latestEpisode } = useLatestEpisode();
  const { data: articles } = useArticles();
  const { data: posts } = useCreatorNotes(5);

  const resolvedType = useMemo(() => {
    if (configValue !== 'auto') {
      return configValue;
    }

    // Compare timestamps to find the newest content
    const candidates: Array<{ type: ConcreteType; timestamp: number }> = [];

    if (latestEpisode) {
      candidates.push({
        type: 'episode',
        timestamp: latestEpisode.publishDate?.getTime() ?? 0,
      });
    }

    if (articles && articles.length > 0) {
      const latest = articles[0]; // already sorted newest-first
      candidates.push({
        type: 'article',
        timestamp: (latest.publishedAt || latest.createdAt).getTime(),
      });
    }

    if (posts && posts.length > 0) {
      candidates.push({
        type: 'post',
        timestamp: posts[0].created_at * 1000,
      });
    }

    if (candidates.length === 0) {
      return 'episode' as ConcreteType;
    }

    return candidates.reduce((best, cur) =>
      cur.timestamp > best.timestamp ? cur : best
    ).type;
  }, [configValue, latestEpisode, articles, posts]);

  return { resolvedType };
}

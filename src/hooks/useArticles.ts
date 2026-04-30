import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { Article } from '@/types/article';

/** Kind 30023 — NIP-23 long-form content */
const ARTICLE_KIND = 30023;

/** Validates that a Nostr event is a proper NIP-23 article */
function validateArticleEvent(event: NostrEvent): boolean {
  if (event.kind !== ARTICLE_KIND) return false;
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  return !!(title && d);
}

/** Converts a validated Nostr event to an Article object */
function eventToArticle(event: NostrEvent): Article {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  const publishedAtStr = getTag('published_at');
  const publishedAt = publishedAtStr ? new Date(parseInt(publishedAtStr) * 1000) : undefined;

  const topics = event.tags
    .filter(([name]) => name === 't')
    .map(([, value]) => value);

  return {
    id: event.id,
    title: getTag('title') || 'Untitled',
    summary: getTag('summary'),
    content: event.content,
    imageUrl: getTag('image'),
    publishedAt: publishedAt || new Date(event.created_at * 1000),
    tags: topics,
    authorPubkey: event.pubkey,
    identifier: getTag('d')!,
    createdAt: new Date(event.created_at * 1000),
    event,
  };
}

/** Fetches all NIP-23 articles, deduplicated by d-tag (keeps latest) */
export function useArticles() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['articles'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([{
        kinds: [ARTICLE_KIND],
        limit: 100,
      }], { signal });

      const valid = events.filter(validateArticleEvent);

      // Deduplicate by d-tag, keeping latest created_at
      const latest = new Map<string, NostrEvent>();
      for (const event of valid) {
        const d = event.tags.find(([n]) => n === 'd')!.at(1)!;
        const existing = latest.get(d);
        if (!existing || event.created_at > existing.created_at) {
          latest.set(d, event);
        }
      }

      const articles = [...latest.values()].map(eventToArticle);
      // Sort newest first
      articles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return articles;
    },
    staleTime: 60000,
  });
}

/** Fetches a single NIP-23 article by addressable coordinates */
export function useArticle(pubkey: string, identifier: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['article', pubkey, identifier],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      const events = await nostr.query([{
        kinds: [ARTICLE_KIND],
        authors: [pubkey],
        '#d': [identifier],
        limit: 1,
      }], { signal });

      const event = events.find(validateArticleEvent);
      return event ? eventToArticle(event) : undefined;
    },
    staleTime: 60000,
  });
}

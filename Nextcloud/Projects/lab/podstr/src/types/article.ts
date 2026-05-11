import type { NostrEvent } from '@nostrify/nostrify';

/** NIP-23 long-form article (kind 30023) */
export interface Article {
  id: string;
  title: string;
  summary?: string;
  /** Raw markdown content */
  content: string;
  imageUrl?: string;
  /** From 'published_at' tag, fallback to created_at */
  publishedAt?: Date;
  /** 't' tags (topics) */
  tags: string[];
  authorPubkey: string;
  /** 'd' tag value */
  identifier: string;
  createdAt: Date;
  /** Original Nostr event for zap/comment integration */
  event: NostrEvent;
}

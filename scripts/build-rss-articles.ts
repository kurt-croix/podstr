import { promises as fs } from 'fs';
import path from 'path';
import { nip19 } from 'nostr-tools';
import { NRelay1, NostrEvent } from '@nostrify/nostrify';
import { PODCAST_CONFIG } from '../src/lib/podcastConfig.js';

// Polyfill WebSocket for Node.js
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

const ARTICLE_KIND = 30023;

function getCreatorPubkeyHex(creatorNpub: string): string {
  try {
    const decoded = nip19.decode(creatorNpub);
    if (decoded.type === 'npub') return decoded.data;
    throw new Error('Invalid npub format');
  } catch (error) {
    console.error('Failed to decode creator npub:', error);
    return creatorNpub;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ArticleData {
  id: string;
  title: string;
  summary?: string;
  content: string;
  imageUrl?: string;
  publishedAt: Date;
  tags: string[];
  authorPubkey: string;
  identifier: string;
  createdAt: Date;
}

function validateArticleEvent(event: NostrEvent, creatorPubkeyHex: string): boolean {
  if (event.kind !== ARTICLE_KIND) return false;
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const d = event.tags.find(([n]) => n === 'd')?.[1];
  if (!title || !d) return false;
  if (event.pubkey !== creatorPubkeyHex) return false;
  return true;
}

function eventToArticle(event: NostrEvent): ArticleData {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  const publishedAtStr = getTag('published_at');
  const publishedAt = publishedAtStr
    ? new Date(parseInt(publishedAtStr) * 1000)
    : new Date(event.created_at * 1000);

  const topicTags = event.tags
    .filter(([n]) => n === 't')
    .map(([, v]) => v);

  return {
    id: event.id,
    title: getTag('title') || 'Untitled',
    summary: getTag('summary'),
    content: event.content || '',
    imageUrl: getTag('image'),
    publishedAt,
    tags: topicTags,
    authorPubkey: event.pubkey,
    identifier: getTag('d')!,
    createdAt: new Date(event.created_at * 1000),
  };
}

function generateArticlesRSSFeed(articles: ArticleData[]): string {
  const config = PODCAST_CONFIG;
  const baseUrl = config.podcast.website || 'https://podstr.example';
  const feedUrl = `${baseUrl}/articles.xml`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.podcast.title)} - Articles</title>
    <description>${escapeXml(config.podcast.description)}</description>
    <link>${escapeXml(baseUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <language>${escapeXml(config.podcast.language)}</language>
    <copyright>${escapeXml(config.podcast.copyright)}</copyright>
    <managingEditor>${escapeXml(config.podcast.email)} (${escapeXml(config.podcast.author)})</managingEditor>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>${config.rss.ttl}</ttl>
    <generator>Podstr Article RSS</generator>

    ${articles.map(article => {
      // Build article URL from naddr
      const naddr = nip19.naddrEncode({
        identifier: article.identifier,
        pubkey: article.authorPubkey,
        kind: ARTICLE_KIND,
      });
      const articleUrl = `${baseUrl}/${naddr}`;

      return `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(articleUrl)}</link>
      <guid isPermaLink="false">${article.id}</guid>
      <pubDate>${article.publishedAt.toUTCString()}</pubDate>
      ${article.summary ? `<description>${escapeXml(article.summary)}</description>` : ''}
      <content:encoded><![CDATA[${article.content}]]></content:encoded>
      ${article.imageUrl ? `<enclosure url="${escapeXml(article.imageUrl)}" type="image/jpeg" length="0" />` : ''}
      ${article.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('\n      ')}
    </item>`;
    }).join('')}
  </channel>
</rss>`;
}

async function fetchArticles(relays: Array<{ url: string; relay: NRelay1 }>, creatorPubkeyHex: string): Promise<ArticleData[]> {
  console.log('📡 Fetching NIP-23 articles from Nostr...');

  const relayPromises = relays.map(async ({ url, relay }) => {
    try {
      const events = await Promise.race([
        relay.query([{
          kinds: [ARTICLE_KIND],
          authors: [creatorPubkeyHex],
          limit: 100,
        }]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Articles query timeout for ${url}`)), 5000)
        ),
      ]) as NostrEvent[];

      const valid = events.filter(e => validateArticleEvent(e, creatorPubkeyHex));
      if (valid.length > 0) console.log(`✅ Found ${valid.length} articles from ${url}`);
      return valid;
    } catch (error) {
      console.log(`⚠️ Failed to fetch articles from ${url}:`, (error as Error).message);
      return [];
    }
  });

  const allResults = await Promise.allSettled(relayPromises);
  const allEvents: NostrEvent[] = [];
  allResults.forEach(r => { if (r.status === 'fulfilled') allEvents.push(...r.value); });

  // Deduplicate by d-tag, keep latest
  const byId = new Map<string, NostrEvent>();
  for (const event of allEvents) {
    const d = event.tags.find(([n]) => n === 'd')!.at(1)!;
    const existing = byId.get(d);
    if (!existing || event.created_at > existing.created_at) byId.set(d, event);
  }

  const articles = Array.from(byId.values())
    .map(eventToArticle)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  console.log(`✅ Found ${articles.length} unique articles`);
  return articles;
}

async function buildArticlesRSS() {
  try {
    console.log('🏗️  Building Articles RSS feed...');

    const creatorPubkeyHex = getCreatorPubkeyHex(PODCAST_CONFIG.creatorNpub);
    console.log(`👤 Creator: ${PODCAST_CONFIG.creatorNpub}`);

    const relayUrls = [
      'wss://relay.primal.net',
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.ditto.pub',
    ];

    const relays = relayUrls.map(url => ({ url, relay: new NRelay1(url) }));

    let articles: ArticleData[] = [];

    try {
      articles = await fetchArticles(relays, creatorPubkeyHex);

      if (articles.length === 0) {
        console.log('⏭️  No articles found - skipping RSS generation');
        process.exit(0);
      }
    } finally {
      for (const { url, relay } of relays) {
        try { relay.close(); } catch {}
      }
      console.log('🔌 Relay queries completed');
    }

    console.log(`📊 Generating Articles RSS with ${articles.length} articles`);

    const rssContent = generateArticlesRSSFeed(articles);

    const distDir = path.resolve('dist');
    await fs.mkdir(distDir, { recursive: true });

    const rssPath = path.join(distDir, 'articles.xml');
    await fs.writeFile(rssPath, rssContent, 'utf-8');

    console.log(`✅ Articles RSS feed generated at: ${rssPath}`);
    console.log(`📊 Feed size: ${(rssContent.length / 1024).toFixed(2)} KB`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating Articles RSS feed:', error);
    process.exit(1);
  }
}

buildArticlesRSS();

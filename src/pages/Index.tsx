import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Headphones, Rss, Zap, Users, MessageSquare, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';
import { EpisodeList } from '@/components/podcast/EpisodeList';
import { ZapLeaderboard } from '@/components/podcast/ZapLeaderboard';
import { RecentActivity } from '@/components/podcast/RecentActivity';
import { ZapDialog } from '@/components/ZapDialog';
import { ArticleCard } from '@/components/article/ArticleCard';
import { PostCard } from '@/components/social/PostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useLatestEpisode } from '@/hooks/usePodcastEpisodes';
import { useArticles } from '@/hooks/useArticles';
import { useCreatorNotes } from '@/hooks/useCreatorPosts';
import { usePodcastConfig } from '@/hooks/usePodcastConfig';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useAppContext } from '@/hooks/useAppContext';
import { useResolvedContentType } from '@/hooks/useResolvedContentType';
import { getCreatorPubkeyHex } from '@/lib/podcastConfig';

// Map content types to display labels and links
const SECTION_META = {
  episode: { label: 'Episodes', link: '/episodes' },
  article: { label: 'Articles', link: '/articles' },
  post: { label: 'Posts', link: '/social' },
} as const;

const Index = () => {
  const { data: latestEpisode } = useLatestEpisode();
  const { data: articles } = useArticles();
  const { data: posts } = useCreatorNotes(5);
  const podcastConfig = usePodcastConfig();
  const { data: creator } = useAuthor(getCreatorPubkeyHex());
  const { user } = useCurrentUser();
  const { playEpisode } = useAudioPlayer();
  const { config } = useAppContext();

  const creatorName = creator?.metadata?.name ||
                      creator?.metadata?.display_name ||
                      podcastConfig.podcast.author;

  // Resolve 'auto' to concrete types, feature-gating articles
  const { resolvedType: rawLatestType } = useResolvedContentType(config.latestSection);
  const { resolvedType: rawRecentType } = useResolvedContentType(config.recentSection);
  const latestType = !config.longFormEnabled && rawLatestType === 'article' ? 'episode' : rawLatestType;
  const recentType = !config.longFormEnabled && rawRecentType === 'article' ? 'episode' : rawRecentType;

  const latestMeta = SECTION_META[latestType];
  const recentMeta = SECTION_META[recentType];

  useSeoMeta({
    title: podcastConfig.podcast.title,
    description: podcastConfig.podcast.description,
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">

            {/* Latest Section — switches based on config */}
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold gradient-text">Latest</h2>
                <Badge variant="secondary" className="animate-pulse-slow">New</Badge>
              </div>

              {latestType === 'episode' && latestEpisode && (
                <LatestEpisodeHero
                  episode={latestEpisode}
                  onPlay={() => playEpisode(latestEpisode)}
                  zapsEnabled={config.zapsEnabled}
                  user={user}
                />
              )}

              {latestType === 'article' && articles && articles.length > 0 && (
                <LatestArticleHero article={articles[0]} />
              )}

              {latestType === 'post' && posts && posts.length > 0 && (
                <Card className="card-hover bg-gradient-to-br from-primary/5 to-transparent border-primary/20 overflow-hidden">
                  <CardContent className="p-6">
                    <PostCard event={posts[0]} className="border-0 shadow-none bg-transparent" />
                  </CardContent>
                </Card>
              )}

              {/* Loading state for auto-detect when nothing loaded yet */}
              {latestType === 'episode' && !latestEpisode && (
                <Card className="border-primary/20">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <Skeleton className="w-32 h-32 rounded-xl" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Explore Navigation */}
            <section className="animate-fade-in-up">
              <h2 className="text-3xl font-bold mb-6 gradient-text">Explore</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Link to="/episodes" className="group">
                  <Card className="card-hover border-primary/20 hover:border-primary/40 bg-gradient-to-br from-primary/5 to-transparent h-full">
                    <CardContent className="p-6 text-center space-y-4">
                      <div className="relative">
                        <Headphones className="w-12 h-12 mx-auto text-primary group-hover:scale-110 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </div>
                      <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">All Episodes</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Browse and listen to all podcast episodes
                      </p>
                    </CardContent>
                  </Card>
                </Link>

                {config.longFormEnabled && (
                  <Link to="/articles" className="group">
                    <Card className="card-hover border-primary/20 hover:border-primary/40 bg-gradient-to-br from-primary/5 to-transparent h-full">
                      <CardContent className="p-6 text-center space-y-4">
                        <div className="relative">
                          <BookOpen className="w-12 h-12 mx-auto text-primary group-hover:scale-110 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </div>
                        <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">Articles</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Long-form posts and articles
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                )}

                <Link to="/community" className="group">
                  <Card className="card-hover border-primary/20 hover:border-primary/40 bg-gradient-to-br from-primary/5 to-transparent h-full">
                    <CardContent className="p-6 text-center space-y-4">
                      <div className="relative">
                        <Users className="w-12 h-12 mx-auto text-primary group-hover:scale-110 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </div>
                      <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">Community</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Engage with listeners and top supporters
                      </p>
                    </CardContent>
                  </Card>
                </Link>

                <Link to="/social" className="group">
                  <Card className="card-hover border-primary/20 hover:border-primary/40 bg-gradient-to-br from-primary/5 to-transparent h-full">
                    <CardContent className="p-6 text-center space-y-4">
                      <div className="relative">
                        <MessageSquare className="w-12 h-12 mx-auto text-primary group-hover:scale-110 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </div>
                      <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">Social Feed</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Follow the creator's latest updates
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </section>

            {/* Recent Section — switches based on config */}
            <section className="animate-fade-in-up">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold gradient-text">Recent {recentMeta.label}</h2>
                <Button variant="outline" asChild className="focus-ring">
                  <Link to={recentMeta.link} className="group">
                    View All {recentMeta.label}
                    <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </Button>
              </div>

              {recentType === 'episode' && (
                <EpisodeList
                  showSearch={false}
                  _showPlayer={false}
                  limit={3}
                  infiniteScroll={false}
                  onPlayEpisode={(episode) => playEpisode(episode)}
                />
              )}

              {recentType === 'article' && articles && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {articles.slice(0, 3).map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              )}

              {recentType === 'post' && posts && (
                <div className="space-y-4">
                  {posts.slice(0, 3).map((event) => (
                    <PostCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Podcast Info */}
            <Card className="card-hover border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="gradient-text">About This Podcast</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {creator?.metadata?.picture ? (
                  <div className="relative group">
                    <img
                      src={creator.metadata.picture}
                      alt={creatorName}
                      className="w-full rounded-xl object-cover shadow-lg group-hover:shadow-xl transition-shadow duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                ) : podcastConfig.podcast.image ? (
                  <div className="relative group">
                    <img
                      src={podcastConfig.podcast.image}
                      alt={podcastConfig.podcast.title}
                      className="w-full rounded-xl object-cover shadow-lg group-hover:shadow-xl transition-shadow duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                ) : null}

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {podcastConfig.podcast.description}
                </p>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">Host:</span>
                    <span className="font-medium">{podcastConfig.podcast.author}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">Language:</span>
                    <span className="font-medium">{podcastConfig.podcast.language.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block mb-2">Categories:</span>
                    <div className="flex flex-wrap gap-1">
                      {podcastConfig.podcast.categories.map((category) => (
                        <Badge key={category} variant="outline" className="text-xs border-primary/30 text-primary">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Button variant="outline" className="w-full focus-ring" asChild>
                  <Link to="/about" className="group">
                    Learn More
                    <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Subscribe Links */}
            <Card className="card-hover border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
              <CardHeader>
                <CardTitle className="gradient-text">Subscribe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start focus-ring" asChild>
                  <a href="https://kurt-croix.github.io/podstr/rss.xml" target="_blank" rel="noopener noreferrer" className="group">
                    <Rss className="w-4 h-4 mr-2 group-hover:animate-pulse" />
                    RSS Feed
                    <svg className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </Button>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Copy the RSS feed URL to subscribe in your favorite podcast app.
                </p>
              </CardContent>
            </Card>

            {/* Zap sections — only rendered when zaps enabled */}
            {config.zapsEnabled && (
              <>
                <ZapLeaderboard limit={5} />
                <RecentActivity limit={10} />

                {/* Support */}
                <Card className="card-hover border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader>
                    <CardTitle className="gradient-text">Support the Show</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Support this podcast by zapping episodes, sharing with friends, and engaging with the community.
                    </p>

                    {creator?.event && user && (creator.metadata?.lud16 || creator.metadata?.lud06) ? (
                      <ZapDialog target={creator.event}>
                        <Button variant="outline" className="w-full btn-primary focus-ring">
                          <Zap className="w-4 h-4 mr-2 animate-pulse" />
                          Zap the Show
                        </Button>
                      </ZapDialog>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        <Zap className="w-4 h-4 mr-2" />
                        {!user ? "Login to Zap" : "Creator has no Lightning address"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Vibed with MKStack */}
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground">
                  Vibed with{' '}
                  <a
                    href="https://soapbox.pub/mkstack"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    MKStack
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Index;

// =============================================================================
// Hero sub-components for the Latest section
// =============================================================================

import type { PodcastEpisode } from '@/types/podcast';
import type { Article } from '@/types/article';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

function LatestEpisodeHero({ episode, onPlay, zapsEnabled, user }: {
  episode: PodcastEpisode;
  onPlay: () => void;
  zapsEnabled: boolean;
  user: ReturnType<typeof useCurrentUser>['user'];
}) {
  return (
    <Card className="card-hover bg-gradient-to-br from-primary/5 to-transparent border-primary/20 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row items-start space-y-6 lg:space-y-0 lg:space-x-6">
          {episode.imageUrl && (
            <div className="relative group">
              <img
                src={episode.imageUrl}
                alt={episode.title}
                className="w-32 h-32 lg:w-40 lg:h-40 rounded-xl object-cover flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {episode.episodeNumber && (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Episode {episode.episodeNumber}
                </Badge>
              )}
              {episode.explicit && (
                <Badge variant="destructive" className="animate-pulse">Explicit</Badge>
              )}
            </div>

            <h3 className="text-2xl lg:text-3xl font-bold line-clamp-2 leading-tight">
              {episode.title}
            </h3>

            {episode.description && (
              <p className="text-muted-foreground mb-4 line-clamp-3 leading-relaxed">
                {episode.description}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button onClick={onPlay} className="btn-primary focus-ring">
                <Headphones className="w-4 h-4 mr-2" />
                Listen Now
              </Button>

              {zapsEnabled && user && episode.totalSats && episode.totalSats > 0 && (
                <div className="flex items-center space-x-1 bg-primary/10 px-2 py-1 rounded-full text-sm">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="font-medium">{episode.totalSats.toLocaleString()} sats</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LatestArticleHero({ article }: { article: Article }) {
  const naddr = nip19.naddrEncode({
    identifier: article.identifier,
    pubkey: article.authorPubkey,
    kind: 30023,
  });

  return (
    <Card className="card-hover bg-gradient-to-br from-primary/5 to-transparent border-primary/20 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row items-start space-y-6 lg:space-y-0 lg:space-x-6">
          {article.imageUrl && (
            <div className="relative group">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-32 h-32 lg:w-40 lg:h-40 rounded-xl object-cover flex-shrink-0 shadow-lg group-hover:shadow-xl transition-shadow duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-4">
            <Badge variant="outline" className="border-primary/30 text-primary">
              Article
            </Badge>

            <h3 className="text-2xl lg:text-3xl font-bold line-clamp-2 leading-tight">
              {article.title}
            </h3>

            {article.summary && (
              <p className="text-muted-foreground mb-4 line-clamp-3 leading-relaxed">
                {article.summary}
              </p>
            )}

            <Button asChild className="btn-primary focus-ring">
              <Link to={`/${naddr}`}>
                <BookOpen className="w-4 h-4 mr-2" />
                Read Article
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

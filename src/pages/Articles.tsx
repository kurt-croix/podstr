import { useSeoMeta } from '@unhead/react';
import { Layout } from '@/components/Layout';
import { ArticleCard } from '@/components/article/ArticleCard';
import { useAppContext } from '@/hooks/useAppContext';
import { useArticles } from '@/hooks/useArticles';
import { usePodcastConfig } from '@/hooks/usePodcastConfig';
import { Button } from '@/components/ui/button';
import { Rss } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import NotFound from './NotFound';

export default function Articles() {
  const { config } = useAppContext();

  if (!config.longFormEnabled) {
    return <NotFound />;
  }

  return <ArticlesContent />;
}

function ArticlesContent() {
  const { data: articles, isLoading, error } = useArticles();
  const podcastConfig = usePodcastConfig();
  const articlesRssUrl = `${podcastConfig.podcast.website || ''}/articles.xml`;

  useSeoMeta({
    title: 'Articles - Podstr',
    description: 'Long-form articles and notes',
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">Articles</h1>
                <p className="text-muted-foreground">Long-form posts and articles</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={articlesRssUrl} target="_blank" rel="noopener noreferrer">
                  <Rss className="w-4 h-4 mr-2" />
                  RSS
                </a>
              </Button>
            </div>
          </div>

          {isLoading && (
            <div className="grid gap-6 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <Skeleton className="aspect-video rounded-t-lg" />
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {error && (
            <Card className="border-destructive">
              <CardContent className="p-6 text-center">
                <p className="text-destructive">Failed to load articles. Please try again later.</p>
              </CardContent>
            </Card>
          )}

          {articles && articles.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No articles published yet.</p>
              </CardContent>
            </Card>
          )}

          {articles && articles.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

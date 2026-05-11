import { useSeoMeta } from '@unhead/react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ArticleContent } from '@/components/article/ArticleContent';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useArticle } from '@/hooks/useArticles';
import { genUserName } from '@/lib/genUserName';
import NotFound from '@/pages/NotFound';

interface ArticlePageProps {
  /** Fetch by addressable event coordinates */
  addressableEvent?: {
    pubkey: string;
    kind: number;
    identifier: string;
  };
}

export function ArticlePage({ addressableEvent }: ArticlePageProps) {
  const { config } = useAppContext();

  if (!config.longFormEnabled) {
    return <NotFound />;
  }

  return <ArticlePageInner addressableEvent={addressableEvent} />;
}

function ArticlePageInner({ addressableEvent }: ArticlePageProps) {
  const navigate = useNavigate();
  const { data: article, isLoading, error } = useArticle(
    addressableEvent!.pubkey,
    addressableEvent!.identifier
  );

  const author = useAuthor(article?.authorPubkey || '');
  const metadata = author.data?.metadata;

  useSeoMeta({
    title: article ? `${article.title} - Podstr` : 'Article - Podstr',
    description: article?.summary || 'Loading article...',
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/2 mb-8" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !article) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-3xl text-center">
          <h2 className="text-xl font-semibold mb-2">Article not found</h2>
          <p className="text-muted-foreground mb-4">This article may not exist or has been removed.</p>
          <Button variant="outline" onClick={() => navigate('/articles')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Articles
          </Button>
        </div>
      </Layout>
    );
  }

  const displayName = metadata?.name || metadata?.display_name || genUserName(article.authorPubkey);
  const profileImage = metadata?.picture;
  const date = article.publishedAt || article.createdAt;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Button variant="ghost" size="sm" asChild className="mb-6">
            <Link to="/articles">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Articles
            </Link>
          </Button>

          {/* Header */}
          <article>
            <header className="mb-8">
              <h1 className="text-3xl font-bold mb-4">{article.title}</h1>

              {article.summary && (
                <p className="text-lg text-muted-foreground mb-4">{article.summary}</p>
              )}

              <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profileImage} alt={displayName} />
                  <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span>{displayName}</span>
                <span>·</span>
                <Calendar className="w-4 h-4" />
                <span title={format(date, 'PPP')}>{formatDistanceToNow(date, { addSuffix: true })}</span>
              </div>

              {article.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {article.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </header>

            {/* Cover image */}
            {article.imageUrl && (
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full rounded-lg mb-8 max-h-96 object-cover"
              />
            )}

            {/* Markdown content */}
            <ArticleContent content={article.content} />

            {/* Comments */}
            <div className="mt-12">
              <CommentsSection root={article.event} title="Discussion" />
            </div>
          </article>
        </div>
      </div>
    </Layout>
  );
}

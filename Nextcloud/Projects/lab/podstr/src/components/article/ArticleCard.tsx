import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import type { Article } from '@/types/article';

interface ArticleCardProps {
  article: Article;
  className?: string;
}

export function ArticleCard({ article, className }: ArticleCardProps) {
  const author = useAuthor(article.authorPubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || metadata?.display_name || genUserName(article.authorPubkey);
  const profileImage = metadata?.picture;

  // Encode article as naddr for linking
  const naddr = nip19.naddrEncode({
    identifier: article.identifier,
    pubkey: article.authorPubkey,
    kind: 30023,
  });

  const date = article.publishedAt || article.createdAt;

  return (
    <Link to={`/${naddr}`}>
      <Card className={`group hover:shadow-md transition-shadow duration-200 ${className || ''}`}>
        {article.imageUrl && (
          <div className="aspect-video overflow-hidden rounded-t-lg">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </div>
        )}
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>

          {article.summary && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {article.summary}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Avatar className="w-5 h-5">
                <AvatarImage src={profileImage} alt={displayName} />
                <AvatarFallback className="text-[10px]">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[120px]">{displayName}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDistanceToNow(date, { addSuffix: true })}</span>
            </div>
          </div>

          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

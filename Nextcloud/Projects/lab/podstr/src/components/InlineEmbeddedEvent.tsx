import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

interface InlineEmbeddedEventProps {
  identifier: string; // note1... or nevent1...
  className?: string;
}

export function InlineEmbeddedEvent({ identifier, className }: InlineEmbeddedEventProps) {
  const { nostr } = useNostr();

  // Extract event ID from note1 or nevent1
  const eventId = (() => {
    try {
      const decoded = nip19.decode(identifier);
      if (decoded.type === 'note') {
        return decoded.data;
      } else if (decoded.type === 'nevent') {
        return decoded.data.id;
      }
      return null;
    } catch {
      return null;
    }
  })();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['inline-embedded-event', eventId],
    queryFn: async (c) => {
      if (!eventId) return null;
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(1500)]);
      const events = await nostr.query([{ ids: [eventId] }], { signal });
      return events[0] || null;
    },
    enabled: !!eventId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (!eventId) {
    return (
      <span className="text-muted-foreground">
        {identifier}
      </span>
    );
  }

  if (isLoading) {
    return <InlineEventSkeleton className={className} />;
  }

  if (error || !event) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
        <MessageSquare className="w-3 h-3" />
        <Link to={`/${identifier}`} className="hover:underline">
          Unable to load event
        </Link>
      </span>
    );
  }

  return <InlineEventContent event={event} identifier={identifier} className={className} />;
}

interface InlineEventContentProps {
  event: NostrEvent;
  identifier: string;
  className?: string;
}

function InlineEventContent({ event, identifier, className }: InlineEventContentProps) {
  const { data: author } = useAuthor(event.pubkey);
  const metadata = author?.metadata;

  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const postDate = new Date(event.created_at * 1000);

  // Truncate content for inline display
  const truncatedContent = event.content.length > 100 
    ? event.content.substring(0, 100) + '...'
    : event.content;

  return (
    <Card className={`inline-block max-w-md border-l-4 border-l-primary/30 bg-muted/30 my-2 ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-start space-x-2">
          <Avatar className="w-6 h-6">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xs">
              {displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <MessageSquare className="w-3 h-3" />
              <p className="font-medium text-xs">{displayName}</p>
              <span className="text-xs text-muted-foreground">•</span>
              <time className="text-xs text-muted-foreground">
                {formatDistanceToNow(postDate, { addSuffix: true })}
              </time>
            </div>
            
            {truncatedContent && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {truncatedContent}
              </p>
            )}
            
            <Button variant="ghost" size="sm" asChild className="text-xs h-6 px-2">
              <Link to={`/${identifier}`}>
                <ExternalLink className="w-3 h-3 mr-1" />
                View
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineEventSkeleton({ className }: { className?: string }) {
  return (
    <Card className={`inline-block max-w-md border-l-4 border-l-primary/30 bg-muted/30 my-2 ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-start space-x-2">
          <Skeleton className="w-6 h-6 rounded-full" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center space-x-2">
              <Skeleton className="w-3 h-3" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-6 w-12" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
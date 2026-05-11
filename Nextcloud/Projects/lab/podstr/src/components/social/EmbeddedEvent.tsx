import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare, Repeat, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { NoteContent } from '@/components/NoteContent';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { encodeEventIdAsNevent } from '@/lib/nip19Utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface EmbeddedEventProps {
  eventId: string;
  className?: string;
}

export function EmbeddedEvent({ eventId, className }: EmbeddedEventProps) {
  const { nostr } = useNostr();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['embedded-event', eventId],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(1500)]);
      const events = await nostr.query([{ ids: [eventId] }], { signal });
      return events[0] || null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (isLoading) {
    return <EmbeddedEventSkeleton className={className} />;
  }

  if (error || !event) {
    return (
      <Card className={`border-dashed border-muted ${className}`}>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">Unable to load embedded event</p>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/${encodeEventIdAsNevent(eventId, '')}`}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Original
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <EmbeddedEventContent event={event} className={className} />;
}

interface EmbeddedEventContentProps {
  event: NostrEvent;
  className?: string;
}

function EmbeddedEventContent({ event, className }: EmbeddedEventContentProps) {
  const { data: author } = useAuthor(event.pubkey);
  const metadata = author?.metadata;

  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const postDate = new Date(event.created_at * 1000);

  const getEventTypeIcon = () => {
    switch (event.kind) {
      case 1:
        return <MessageSquare className="w-4 h-4" />;
      case 6:
      case 16:
        return <Repeat className="w-4 h-4" />;
      case 7:
        return <Zap className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getEventTypeLabel = () => {
    switch (event.kind) {
      case 1:
        return 'Note';
      case 6:
      case 16:
        return 'Repost';
      case 7:
        return 'Like';
      default:
        return `Kind ${event.kind}`;
    }
  };

  // Create appropriate NIP-19 identifier for linking
  const getEventLink = () => {
    if (event.kind === 1) {
      return `/${encodeEventIdAsNevent(event.id, event.pubkey)}`;
    }

    // For other events, use nevent with author context
    const nevent = nip19.neventEncode({
      id: event.id,
      author: event.pubkey,
    });
    return `/${nevent}`;
  };

  return (
    <Card className={`border-l-4 border-l-primary/20 bg-muted/20 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xs">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              {getEventTypeIcon()}
              <p className="font-medium text-sm">{displayName}</p>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{getEventTypeLabel()}</span>
              <span className="text-xs text-muted-foreground">•</span>
              <time className="text-xs text-muted-foreground">
                {formatDistanceToNow(postDate, { addSuffix: true })}
              </time>
            </div>

            {event.content && (
              <div className="mb-3">
                <NoteContent
                  event={event}
                  className="text-sm text-muted-foreground line-clamp-3"
                />
              </div>
            )}

            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to={getEventLink()}>
                <ExternalLink className="w-3 h-3 mr-1" />
                View Full Event
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmbeddedEventSkeleton({ className }: { className?: string }) {
  return (
    <Card className={`border-l-4 border-l-primary/20 bg-muted/20 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
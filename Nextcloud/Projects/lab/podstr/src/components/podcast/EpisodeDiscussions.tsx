import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteContent } from '@/components/NoteContent';
import { useAuthor } from '@/hooks/useAuthor';
import { usePodcastEpisodes } from '@/hooks/usePodcastEpisodes';
import { encodeEventIdAsNevent } from '@/lib/nip19Utils';
import { genUserName } from '@/lib/genUserName';
import type { NostrEvent } from '@nostrify/nostrify';

interface _EpisodeComment {
  comment: NostrEvent;
  episodeId: string;
  episodeTitle?: string;
}

interface EpisodeDiscussionsProps {
  limit?: number;
  className?: string;
}

export function EpisodeDiscussions({ limit = 20, className }: EpisodeDiscussionsProps) {
  const { nostr } = useNostr();
  const { data: episodes } = usePodcastEpisodes();

  // Fetch all comments for podcast episodes
  const { data: commentsData, isLoading, error } = useQuery({
    queryKey: ['episode-discussions', limit],
    queryFn: async (c) => {
      if (!episodes || episodes.length === 0) {
        return [];
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Query for all kind 1111 comments that reference our episodes
      // Episodes are addressable events (kind 30054), so we need to query by #a tags
      const addressableTags = episodes.map(ep => `30054:${ep.authorPubkey}:${ep.identifier}`);
      
      const commentEvents = await nostr.query([{
        kinds: [1111], // NIP-22 comments
        '#a': addressableTags, // Comments on our episodes using addressable event tags
        limit: limit * 2 // Get more to account for filtering
      }], { signal });

      // Create episode lookup map by addressable event tag
      const episodeMap = new Map(episodes.map(ep => [`30054:${ep.authorPubkey}:${ep.identifier}`, ep]));

      // Process and enrich comments with episode info
      const enrichedComments = commentEvents
        .map(comment => {
          // Find which episode this comment is for using addressable event tag
          const addressableTag = comment.tags.find(([name]) => name === 'a')?.[1];
          if (!addressableTag) return null;

          const episode = episodeMap.get(addressableTag);

          return {
            comment,
            episodeId: episode?.eventId || addressableTag, // Use eventId for linking
            episodeTitle: episode?.title
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.comment.created_at - a.comment.created_at) // Most recent first
        .slice(0, limit); // Apply final limit

      return enrichedComments;
    },
    enabled: !!episodes && episodes.length > 0,
    staleTime: 30000, // 30 seconds
  });

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center">
          <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Failed to load discussions</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!commentsData || commentsData.filter(item => item !== null).length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center">
          <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Discussions Yet</h3>
          <p className="text-muted-foreground mb-4">
            Be the first to start a conversation about an episode!
          </p>
          <Link
            to="/episodes"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            Browse Episodes
            <ExternalLink className="w-3 h-3 ml-1" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {commentsData?.filter(item => item !== null).map(({ comment, episodeId, episodeTitle }) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          episodeId={episodeId}
          episodeTitle={episodeTitle}
        />
      ))}
    </div>
  );
}

interface CommentCardProps {
  comment: NostrEvent;
  episodeId: string;
  episodeTitle?: string;
}

function CommentCard({ comment, episodeId, episodeTitle }: CommentCardProps) {
  const author = useAuthor(comment.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(comment.pubkey);
  const timeAgo = formatDistanceToNow(new Date(comment.created_at * 1000), { addSuffix: true });

  // Generate links
  const authorNpub = nip19.npubEncode(comment.pubkey);
  const episodeNevent = encodeEventIdAsNevent(episodeId, comment.pubkey);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Link to={`/${authorNpub}`}>
              <Avatar className="h-8 w-8 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer">
                <AvatarImage src={metadata?.picture} />
                <AvatarFallback className="text-xs">
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <Link
                to={`/${authorNpub}`}
                className="font-medium text-sm hover:text-primary transition-colors"
              >
                {displayName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {timeAgo}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            Comment
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Comment Content */}
          <div className="text-sm">
            <NoteContent event={comment} className="text-sm line-clamp-4" />
          </div>

          {/* Episode Reference */}
          {episodeTitle && (
            <div className="pt-2 border-t border-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <MessageCircle className="w-3 h-3" />
                  <span>Discussing:</span>
                </div>
                <Link
                  to={`/${episodeNevent}`}
                  className="text-xs text-primary hover:underline line-clamp-1 max-w-[60%]"
                >
                  {episodeTitle}
                </Link>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
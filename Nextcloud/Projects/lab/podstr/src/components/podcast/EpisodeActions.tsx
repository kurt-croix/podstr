import { MessageCircle, Heart, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ZapButton } from '@/components/ZapButton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useComments } from '@/hooks/useComments';
import { encodeEpisodeAsNaddr } from '@/lib/nip19Utils';
import type { NostrEvent } from '@nostrify/nostrify';
import type { PodcastEpisode } from '@/types/podcast';
import { cn } from '@/lib/utils';
import { extractZapAmount, validateZapEvent } from '@/lib/zapUtils';

interface InteractionCounts {
  likes: number;
  zaps: number;
  totalSats: number;
}

interface UserInteractions {
  hasLiked: boolean;
}

interface EpisodeActionsProps {
  episode: PodcastEpisode;
  className?: string;
  showComments?: boolean;
  onToggleComments?: () => void;
}

// Create a NostrEvent-like object from PodcastEpisode
function createEventFromEpisode(episode: PodcastEpisode): NostrEvent {
  return {
    id: episode.eventId,
    kind: 30054, // Addressable podcast episode
    pubkey: episode.authorPubkey,
    created_at: Math.floor(episode.createdAt.getTime() / 1000),
    tags: [
      ['d', episode.identifier], // Addressable event identifier
      ['title', episode.title],
      ['t', 'podcast'],
    ],
    content: episode.content || episode.description || '',
    sig: '' // Not needed for actions
  } as NostrEvent;
}

export function EpisodeActions({ episode, className, showComments, onToggleComments }: EpisodeActionsProps) {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const { nostr } = useNostr();
  const queryClient = useQueryClient();


  const event = createEventFromEpisode(episode);

  // Query for episode comments (NIP-22 comments)
  const { data: commentsData } = useComments(event);
  const commentCount = commentsData?.topLevelComments?.length || 0;

  // Query for user's interactions with this episode
  const { data: userInteractions } = useQuery<UserInteractions>({
    queryKey: ['episode-user-interactions', episode.eventId, user?.pubkey],
    queryFn: async (c) => {
      if (!user?.pubkey) return { hasLiked: false };

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      // Query for user's likes of this episode
      const interactions = await nostr.query([{
        kinds: [7], // Likes
        authors: [user.pubkey],
        '#e': [episode.eventId],
        limit: 10
      }], { signal });

      const hasLiked = interactions.some(e => e.kind === 7);

      return { hasLiked };
    },
    enabled: !!user?.pubkey,
    staleTime: 30000, // 30 seconds
  });

  // Query for interaction counts
  const { data: interactionCounts } = useQuery<InteractionCounts>({
    queryKey: ['episode-interaction-counts', episode.eventId],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);

      // Query for all interactions with this episode
      const interactions = await nostr.query([{
        kinds: [7, 9735], // Likes, zaps (no longer counting replies here)
        '#e': [episode.eventId],
        limit: 500
      }], { signal });

      const likes = interactions.filter(e => e.kind === 7).length;

      // Count zaps and calculate total sats
      const zaps = interactions.filter(e => e.kind === 9735).filter(validateZapEvent);
      const zapCount = zaps.length;
      const totalSats = zaps.reduce((total, zap) => {
        // Use our consistent zap amount extraction utility
        const amount = extractZapAmount(zap);
        return total + amount;
      }, 0);

      return { likes, zaps: zapCount, totalSats };
    },
    staleTime: 60000, // 1 minute
  });


  const handleLike = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Please log in to like.",
        variant: "destructive",
      });
      return;
    }

    if (userInteractions?.hasLiked) {
      toast({
        title: "Already liked",
        description: "You have already liked this episode.",
      });
      return;
    }

    try {
      // Optimistically update user interactions
      queryClient.setQueryData(['episode-user-interactions', episode.eventId, user.pubkey], (_old: UserInteractions | undefined) => {
        return { hasLiked: true };
      });

      // Optimistically update interaction counts
      queryClient.setQueryData(['episode-interaction-counts', episode.eventId], (old: InteractionCounts | undefined) => {
        if (!old) return { likes: 1, zaps: 0, totalSats: 0 };
        return { ...old, likes: old.likes + 1 };
      });

      // Publish the like
      await createEvent({
        kind: 7,
        content: '+',
        tags: [
          ['e', episode.eventId],
          ['p', episode.authorPubkey],
          ['k', '30023'] // Kind of the event being liked
        ]
      });

      toast({
        title: "Liked!",
        description: "Your like has been published to the network.",
      });

      // Delay invalidation to allow network propagation
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['episode-user-interactions', episode.eventId, user.pubkey] });
        queryClient.invalidateQueries({ queryKey: ['episode-interaction-counts', episode.eventId] });
      }, 2000);
    } catch {
      // Revert optimistic updates on error
      queryClient.setQueryData(['episode-user-interactions', episode.eventId, user.pubkey], (_old: UserInteractions | undefined) => {
        return { hasLiked: false };
      });

      queryClient.setQueryData(['episode-interaction-counts', episode.eventId], (old: InteractionCounts | undefined) => {
        if (!old) return { likes: 0, zaps: 0, totalSats: 0 };
        return { ...old, likes: Math.max(0, old.likes - 1) };
      });

      toast({
        title: "Failed to like",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    try {
      const naddr = encodeEpisodeAsNaddr(episode.authorPubkey, episode.identifier);
      const url = `${window.location.origin}/${naddr}`;

      await navigator.clipboard.writeText(url);

      toast({
        title: "Link copied!",
        description: "The episode link has been copied to your clipboard.",
      });
    } catch {
      toast({
        title: "Failed to copy link",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={cn("flex items-center space-x-3 sm:space-x-2", className)}>
      {/* Comment Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "text-muted-foreground hover:text-blue-500 h-10 px-3 sm:h-8 sm:px-2",
          showComments && "text-blue-500"
        )}
        onClick={onToggleComments}
      >
        <MessageCircle className={cn(
          "w-5 h-5 sm:w-4 sm:h-4 mr-1.5 sm:mr-1",
          showComments && "fill-current"
        )} />
        <span className="text-sm sm:text-xs">
          {commentCount}
        </span>
      </Button>

      {/* Like Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "text-muted-foreground hover:text-red-500 h-10 px-3 sm:h-8 sm:px-2",
          userInteractions?.hasLiked && "text-red-500"
        )}
        onClick={handleLike}
      >
        <Heart className={cn(
          "w-5 h-5 sm:w-4 sm:h-4 mr-1.5 sm:mr-1",
          userInteractions?.hasLiked && "fill-current"
        )} />
        <span className="text-sm sm:text-xs">
          {interactionCounts?.likes || 0}
        </span>
      </Button>

      {/* Zap Button */}
      <ZapButton
        target={event}
        className="text-sm sm:text-xs h-10 px-3 sm:h-8 sm:px-2"
        zapData={{
          count: interactionCounts?.zaps || 0,
          totalSats: interactionCounts?.totalSats || 0,
          isLoading: false
        }}
        hideWhenEmpty={false}
        onZapSuccess={(amount: number) => {
          // Optimistically update interaction counts when zap succeeds
          queryClient.setQueryData(['episode-interaction-counts', episode.eventId], (old: InteractionCounts | undefined) => {
            if (!old) return { likes: 0, zaps: 1, totalSats: amount };
            return { ...old, zaps: old.zaps + 1, totalSats: old.totalSats + amount };
          });
        }}
      />

      {/* Share Button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-blue-500 h-10 px-3 sm:h-8 sm:px-2"
        onClick={handleShare}
      >
        <Share className="w-5 h-5 sm:w-4 sm:h-4" />
      </Button>

    </div>
  );
}
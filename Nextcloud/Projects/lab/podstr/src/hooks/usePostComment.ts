import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { NKinds, type NostrEvent } from '@nostrify/nostrify';

interface PostCommentParams {
  root: NostrEvent | URL; // The root event to comment on
  reply?: NostrEvent | URL; // Optional reply to another comment
  content: string;
}

/** Post a NIP-22 (kind 1111) comment on an event. */
export function usePostComment() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ root, reply, content }: PostCommentParams) => {
      if (!user) throw new Error('User must be logged in to post comments');

      // Generate optimistic comment ID
      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = Math.floor(Date.now() / 1000);
      const tags: string[][] = [];

      // d-tag identifiers
      const dRoot = root instanceof URL ? '' : root.tags.find(([name]) => name === 'd')?.[1] ?? '';
      const dReply = reply instanceof URL ? '' : reply?.tags.find(([name]) => name === 'd')?.[1] ?? '';

      // Root event tags
      if (root instanceof URL) {
        tags.push(['I', root.toString()]);
      } else if (NKinds.addressable(root.kind)) {
        tags.push(['A', `${root.kind}:${root.pubkey}:${dRoot}`]);
      } else if (NKinds.replaceable(root.kind)) {
        tags.push(['A', `${root.kind}:${root.pubkey}:`]);
      } else {
        tags.push(['E', root.id]);
      }
      if (root instanceof URL) {
        tags.push(['K', root.hostname]);
      } else {
        tags.push(['K', root.kind.toString()]);
        tags.push(['P', root.pubkey]);
      }

      // Reply event tags
      if (reply) {
        if (reply instanceof URL) {
          tags.push(['i', reply.toString()]);
        } else if (NKinds.addressable(reply.kind)) {
          tags.push(['a', `${reply.kind}:${reply.pubkey}:${dReply}`]);
        } else if (NKinds.replaceable(reply.kind)) {
          tags.push(['a', `${reply.kind}:${reply.pubkey}:`]);
        } else {
          tags.push(['e', reply.id]);
        }
        if (reply instanceof URL) {
          tags.push(['k', reply.hostname]);
        } else {
          tags.push(['k', reply.kind.toString()]);
          tags.push(['p', reply.pubkey]);
        }
      } else {
        // If this is a top-level comment, use the root event's tags
        if (root instanceof URL) {
          tags.push(['i', root.toString()]);
        } else if (NKinds.addressable(root.kind)) {
          tags.push(['a', `${root.kind}:${root.pubkey}:${dRoot}`]);
        } else if (NKinds.replaceable(root.kind)) {
          tags.push(['a', `${root.kind}:${root.pubkey}:`]);
        } else {
          tags.push(['e', root.id]);
        }
        if (root instanceof URL) {
          tags.push(['k', root.hostname]);
        } else {
          tags.push(['k', root.kind.toString()]);
          tags.push(['p', root.pubkey]);
        }
      }

      // Create optimistic comment object
      const optimisticComment: NostrEvent = {
        id: optimisticId,
        kind: 1111,
        pubkey: user.pubkey,
        created_at: now,
        content,
        tags,
        sig: 'optimistic-signature'
      };

      // Add optimistic comment to cache immediately
      const queryKey = ['comments', root instanceof URL ? root.toString() : root.id];
      queryClient.setQueryData(queryKey, (oldData: {
        allComments: NostrEvent[];
        topLevelComments: NostrEvent[];
        getDescendants: (commentId: string) => NostrEvent[];
        getDirectReplies: (commentId: string) => NostrEvent[];
      } | undefined) => {
        if (!oldData) {
          return {
            allComments: [optimisticComment],
            topLevelComments: reply ? [] : [optimisticComment],
            getDescendants: () => [],
            getDirectReplies: () => []
          };
        }

        return {
          ...oldData,
          allComments: [optimisticComment, ...oldData.allComments],
          topLevelComments: reply
            ? oldData.topLevelComments
            : [optimisticComment, ...oldData.topLevelComments]
        };
      });

      try {
        // Publish the actual event
        const event = await publishEvent({
          kind: 1111,
          content,
          tags,
        });

        // Replace optimistic comment with real one
        queryClient.setQueryData(queryKey, (oldData: {
          allComments: NostrEvent[];
          topLevelComments: NostrEvent[];
          getDescendants: (commentId: string) => NostrEvent[];
          getDirectReplies: (commentId: string) => NostrEvent[];
        } | undefined) => {
          if (!oldData) return oldData;

          const replaceOptimistic = (comments: NostrEvent[]) =>
            comments.map(comment =>
              comment.id === optimisticId ? event : comment
            );

          return {
            ...oldData,
            allComments: replaceOptimistic(oldData.allComments),
            topLevelComments: replaceOptimistic(oldData.topLevelComments)
          };
        });

        return event;
      } catch (error) {
        // Remove optimistic comment on error
        queryClient.setQueryData(queryKey, (oldData: {
          allComments: NostrEvent[];
          topLevelComments: NostrEvent[];
          getDescendants: (commentId: string) => NostrEvent[];
          getDirectReplies: (commentId: string) => NostrEvent[];
        } | undefined) => {
          if (!oldData) return oldData;

          const removeOptimistic = (comments: NostrEvent[]) =>
            comments.filter(comment => comment.id !== optimisticId);

          return {
            ...oldData,
            allComments: removeOptimistic(oldData.allComments),
            topLevelComments: removeOptimistic(oldData.topLevelComments)
          };
        });

        throw error;
      }
    },
    onSuccess: (_, { root }) => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({
        queryKey: ['comments', root instanceof URL ? root.toString() : root.id]
      });
    },
  });
}
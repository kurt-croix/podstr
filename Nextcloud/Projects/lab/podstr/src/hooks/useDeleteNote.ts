import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Hook to delete a Nostr note by publishing a deletion event (NIP-09)
 */
export function useDeleteNote() {
  const { mutate: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: NostrEvent) => {
      return new Promise<void>((resolve, reject) => {
        // Create a deletion event (kind 5) according to NIP-09
        createEvent(
          {
            kind: 5,
            content: 'deleted',
            tags: [
              ['e', event.id], // Reference to the event being deleted
              ['k', event.kind.toString()] // Kind of the deleted event
            ]
          },
          {
            onSuccess: () => {
              resolve();
            },
            onError: (error) => {
              reject(error);
            }
          }
        );
      });
    },
    onSuccess: (_, deletedEvent) => {
      toast({
        title: "Note deleted",
        description: "Your note has been deleted from the network.",
      });

      // Invalidate relevant queries to update the UI
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
      queryClient.invalidateQueries({ queryKey: ['creator-activity'] });
      queryClient.invalidateQueries({ queryKey: ['creator-notes'] });
      
      // Optimistically remove the deleted event from cache
      queryClient.setQueryData(['creator-posts'], (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) return oldData;
        
        const typedOldData = oldData as { pages: NostrEvent[][] };
        return {
          ...typedOldData,
          pages: typedOldData.pages.map((page: NostrEvent[]) =>
            page.filter((event: NostrEvent) => event.id !== deletedEvent.id)
          )
        };
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete note",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  });
}
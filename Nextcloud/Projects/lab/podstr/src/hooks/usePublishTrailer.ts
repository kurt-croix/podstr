import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import type { TrailerFormData } from '@/types/podcast';
import { PODCAST_KINDS, isPodcastCreator } from '@/lib/podcastConfig';

/**
 * Hook for publishing podcast trailers (creator only)
 * Based on podcast 2.0 trailer specification
 */
export function usePublishTrailer() {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trailerData: TrailerFormData): Promise<string> => {
      // Verify user is logged in and is the creator
      if (!user) {
        throw new Error('You must be logged in to publish trailers');
      }

      if (!isPodcastCreator(user.pubkey)) {
        throw new Error('Only the podcast creator can publish trailers');
      }

      // Upload trailer file if provided
      let trailerUrl = trailerData.url;
      let trailerType = trailerData.audioType;
      let trailerLength = trailerData.length;

      if (trailerData.audioFile) {
        try {
          const trailerTags = await uploadFile(trailerData.audioFile);
          trailerUrl = trailerTags[0][1]; // First tag contains the URL
          trailerType = trailerData.audioFile.type;
          trailerLength = trailerData.audioFile.size;
        } catch (error) {
          throw new Error(`Failed to upload trailer file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (!trailerUrl) {
        throw new Error('Trailer URL or file is required');
      }

      // If we have a URL but no type, try to infer from file extension
      if (trailerUrl && !trailerType) {
        try {
          const url = new URL(trailerUrl);
          const pathname = url.pathname.toLowerCase();
          if (pathname.endsWith('.mp3')) {
            trailerType = 'audio/mpeg';
          } else if (pathname.endsWith('.wav')) {
            trailerType = 'audio/wav';
          } else if (pathname.endsWith('.m4a')) {
            trailerType = 'audio/mp4';
          } else if (pathname.endsWith('.ogg')) {
            trailerType = 'audio/ogg';
          } else if (pathname.endsWith('.mp4')) {
            trailerType = 'video/mp4';
          } else if (pathname.endsWith('.webm')) {
            trailerType = 'video/webm';
          } else if (pathname.endsWith('.mov')) {
            trailerType = 'video/quicktime';
          } else {
            trailerType = 'audio/mpeg'; // Default fallback
          }
        } catch {
          trailerType = 'audio/mpeg';
        }
      }

      // Generate a unique identifier for this addressable trailer
      const trailerIdentifier = `trailer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Build tags for addressable podcast trailer (kind 30055)
      const tags: Array<[string, ...string[]]> = [
        ['d', trailerIdentifier], // Addressable event identifier
        ['title', trailerData.title], // Trailer title (max 128 chars)
        ['url', trailerUrl], // Trailer URL
        ['pubdate', new Date().toUTCString()], // RFC2822 format
        ['alt', `Podcast trailer: ${trailerData.title}`] // NIP-31 alt tag
      ];

      // Add optional tags per podcast 2.0 spec
      if (trailerLength && trailerLength > 0) {
        tags.push(['length', trailerLength.toString()]);
      }

      if (trailerType) {
        tags.push(['type', trailerType]);
      }

      if (trailerData.season) {
        tags.push(['season', trailerData.season.toString()]);
      }

      // Create and publish the event
      const event = await createEvent({
        kind: PODCAST_KINDS.TRAILER,
        content: trailerData.title, // Content is the trailer title per spec
        tags
      });

      // Invalidate related queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['podcast-trailers'] });
      await queryClient.invalidateQueries({ queryKey: ['podcast-metadata'] });
      await queryClient.invalidateQueries({ queryKey: ['rss-feed-generator'] });

      return event.id;
    },

    onError: (error) => {
      console.error('Failed to publish trailer:', error);
    }
  });
}

/**
 * Hook for updating/editing existing trailers
 */
export function useUpdateTrailer() {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      trailerId,
      trailerIdentifier,
      trailerData
    }: {
      trailerId: string;
      trailerIdentifier: string;
      trailerData: TrailerFormData;
    }): Promise<string> => {
      // Verify user is logged in and is the creator
      if (!user) {
        throw new Error('You must be logged in to update trailers');
      }

      if (!isPodcastCreator(user.pubkey)) {
        throw new Error('Only the podcast creator can update trailers');
      }

      // Upload new files if provided
      let trailerUrl = trailerData.url;
      let trailerType = trailerData.audioType;
      let trailerLength = trailerData.length;

      if (trailerData.audioFile) {
        try {
          const trailerTags = await uploadFile(trailerData.audioFile);
          trailerUrl = trailerTags[0][1];
          trailerType = trailerData.audioFile.type;
          trailerLength = trailerData.audioFile.size;
        } catch (error) {
          throw new Error(`Failed to upload trailer file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (!trailerUrl) {
        throw new Error('Trailer URL or file is required');
      }

      // Infer type from URL if not provided
      if (trailerUrl && !trailerType) {
        try {
          const url = new URL(trailerUrl);
          const pathname = url.pathname.toLowerCase();
          if (pathname.endsWith('.mp3')) {
            trailerType = 'audio/mpeg';
          } else if (pathname.endsWith('.wav')) {
            trailerType = 'audio/wav';
          } else if (pathname.endsWith('.m4a')) {
            trailerType = 'audio/mp4';
          } else if (pathname.endsWith('.ogg')) {
            trailerType = 'audio/ogg';
          } else if (pathname.endsWith('.mp4')) {
            trailerType = 'video/mp4';
          } else if (pathname.endsWith('.webm')) {
            trailerType = 'video/webm';
          } else if (pathname.endsWith('.mov')) {
            trailerType = 'video/quicktime';
          } else {
            trailerType = 'audio/mpeg';
          }
        } catch {
          trailerType = 'audio/mpeg';
        }
      }

      // Build tags for updated addressable trailer
      const tags: Array<[string, ...string[]]> = [
        ['d', trailerIdentifier], // Preserve the original addressable event identifier
        ['title', trailerData.title],
        ['url', trailerUrl],
        ['pubdate', new Date().toUTCString()],
        ['alt', `Updated podcast trailer: ${trailerData.title}`],
        ['edit', trailerId] // Reference to the original event being edited
      ];

      if (trailerLength && trailerLength > 0) {
        tags.push(['length', trailerLength.toString()]);
      }

      if (trailerType) {
        tags.push(['type', trailerType]);
      }

      if (trailerData.season) {
        tags.push(['season', trailerData.season.toString()]);
      }

      // Create the updated event
      const event = await createEvent({
        kind: PODCAST_KINDS.TRAILER,
        content: trailerData.title,
        tags
      });

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['podcast-trailers'] });
      await queryClient.invalidateQueries({ queryKey: ['podcast-trailer', trailerId] });
      await queryClient.invalidateQueries({ queryKey: ['podcast-metadata'] });
      await queryClient.invalidateQueries({ queryKey: ['rss-feed-generator'] });

      return event.id;
    },
    onError: (error) => {
      console.error('Trailer update failed:', error);
    }
  });
}

/**
 * Hook for deleting trailers (creates deletion event)
 */
export function useDeleteTrailer() {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trailerId: string): Promise<string> => {
      if (!user) {
        throw new Error('You must be logged in to delete trailers');
      }

      if (!isPodcastCreator(user.pubkey)) {
        throw new Error('Only the podcast creator can delete trailers');
      }

      // Create a deletion event (NIP-09)
      const event = await createEvent({
        kind: 5, // Deletion event
        content: 'Deleted podcast trailer',
        tags: [
          ['e', trailerId]
        ]
      });

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['podcast-trailers'] });
      await queryClient.invalidateQueries({ queryKey: ['podcast-trailer', trailerId] });
      await queryClient.invalidateQueries({ queryKey: ['podcast-metadata'] });
      await queryClient.invalidateQueries({ queryKey: ['rss-feed-generator'] });

      return event.id;
    }
  });
}
import { useNip38 } from '@/hooks/useNip38';

/**
 * Component that automatically publishes NIP-38 status updates for podcast episodes
 * Based on the current audio player state. Uses the same 'd' tag as music ('music')
 * for maximum compatibility with existing Nostr clients that already support music status.
 * 
 * This component should be mounted at the app level to ensure status updates
 * are published whenever the user is playing podcast episodes.
 * 
 * The status updates will appear next to the user's name in compatible Nostr clients
 * and include a nevent link back to the episode for proper Nostr routing.
 */
export function Nip38Publisher() {
  // This hook handles all the NIP-38 status update logic
  useNip38();

  // This component doesn't render anything - it's purely for side effects
  return null;
}

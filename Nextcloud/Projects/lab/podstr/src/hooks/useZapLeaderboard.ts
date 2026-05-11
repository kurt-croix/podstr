import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { ZapLeaderboardEntry } from '@/types/podcast';
import { getCreatorPubkeyHex } from '@/lib/podcastConfig';
import { extractZapAmount, extractZapperPubkey, validateZapEvent, extractZappedEventId } from '@/lib/zapUtils';

/**
 * Hook to fetch zap leaderboard for the podcast
 */
export function useZapLeaderboard(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['zap-leaderboard', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);
      
      // Query for zap events (kind 9735) that reference the podcast creator
      const zapEvents = await nostr.query([{
        kinds: [9735], // Zap events
        '#p': [getCreatorPubkeyHex()], // Zaps to the creator
        limit: 1000 // Get more zaps to aggregate
      }], { signal });

      // Aggregate zaps by sender
      const zapAggregation = new Map<string, {
        totalAmount: number;
        zapCount: number;
        lastZapDate: Date;
      }>();

      zapEvents.forEach(zapEvent => {
        // Validate the zap event structure
        if (!validateZapEvent(zapEvent)) {
          console.warn('Invalid zap event structure:', zapEvent.id);
          return;
        }

        // Extract amount using proper bolt11/description parsing
        const amount = extractZapAmount(zapEvent);
        
        // Extract the actual zapper's pubkey (from P tag, not event pubkey)
        const zapperPubkey = extractZapperPubkey(zapEvent);
        if (!zapperPubkey) {
          console.warn('No zapper pubkey found in zap event:', zapEvent.id);
          return;
        }
        
        const zapDate = new Date(zapEvent.created_at * 1000);

        const existing = zapAggregation.get(zapperPubkey);
        if (existing) {
          existing.totalAmount += amount;
          existing.zapCount += 1;
          if (zapDate > existing.lastZapDate) {
            existing.lastZapDate = zapDate;
          }
        } else {
          zapAggregation.set(zapperPubkey, {
            totalAmount: amount,
            zapCount: 1,
            lastZapDate: zapDate
          });
        }
      });

      // Convert to leaderboard entries and sort by total amount
      const leaderboard: ZapLeaderboardEntry[] = Array.from(zapAggregation.entries())
        .map(([pubkey, stats]) => ({
          userPubkey: pubkey,
          ...stats
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, limit);

      return leaderboard;
    },
    staleTime: 300000, // 5 minutes
  });
}


/**
 * Hook to get recent zap activity
 */
export function useRecentZapActivity(limit: number = 20) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['recent-zap-activity', limit],
    queryFn: async (context) => {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(10000)]);
      
      // Get recent zap events
      const zapEvents = await nostr.query([{
        kinds: [9735],
        '#p': [getCreatorPubkeyHex()],
        limit: limit
      }], { signal });

      // Filter and sort by creation time (most recent first)
      return zapEvents
        .filter(validateZapEvent) // Only include valid zap events
        .sort((a, b) => b.created_at - a.created_at)
        .map(zapEvent => {
          // Extract amount using proper bolt11/description parsing
          const amount = extractZapAmount(zapEvent);
          
          // Extract the actual zapper's pubkey (from P tag, not event pubkey)
          const zapperPubkey = extractZapperPubkey(zapEvent);
          
          // Extract the episode being zapped
          const episodeId = extractZappedEventId(zapEvent);

          return {
            id: zapEvent.id,
            userPubkey: zapperPubkey || zapEvent.pubkey, // Fallback to event pubkey if no P tag
            amount,
            episodeId,
            timestamp: new Date(zapEvent.created_at * 1000),
            zapEvent
          };
        })
        .filter(activity => activity.userPubkey); // Remove entries without valid zapper pubkey
    },
    staleTime: 60000, // 1 minute
  });
}
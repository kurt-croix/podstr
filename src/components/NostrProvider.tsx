import React, { useEffect, useRef } from 'react';
import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

interface NostrProviderProps {
  children: React.ReactNode;
}

function NostrProvider(props: NostrProviderProps) {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayUrl = useRef<string>(config.relayUrl);

  // Define multiple relays prioritized by speed and reliability
  // All known relays — used for publishing to ensure broad distribution
  const allRelayUrls = useRef<string[]>([
    'wss://relay.damus.io',      // ~120ms query response
    'wss://relay.primal.net',    // ~175ms query response
    'wss://nos.lol',             // ~180ms query response
    'wss://relay.nostr.band',    // Slow but good coverage
    'wss://relay.ditto.pub',     // Slow but covers Ditto ecosystem
    'wss://nostr.wine',          // Slow but well-known
  ]);

  // Fast relays only — used for reads. NPool.query() waits for ALL relays
  // to EOSE before returning, so slow relays block every query.
  const multiRelayUrls = useRef<string[]>([
    'wss://relay.damus.io',      // ~120ms query response
    'wss://relay.primal.net',    // ~175ms query response
    'wss://nos.lol',             // ~180ms query response
  ]);

  // Update refs when config changes
  useEffect(() => {
    relayUrl.current = config.relayUrl;
    // Ensure selected relay is first in the list for priority
    multiRelayUrls.current = [
      config.relayUrl,
      ...multiRelayUrls.current.filter(url => url !== config.relayUrl)
    ].slice(0, 3); // Max 3 fast relays — more = slower queries
    console.log('[Nostr] Relays:', multiRelayUrls.current.map((url) =>
      `${url}${url === config.relayUrl ? ' (selected)' : ''}`
    ).join(', '));
    queryClient.resetQueries();
  }, [config.relayUrl, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        // Query multiple relays for better data coverage and consistency
        // NPool automatically deduplicates results from multiple relays
        const relayMap = new Map();
        multiRelayUrls.current.forEach(url => {
          relayMap.set(url, filters);
        });
        return relayMap;
      },
      eventRouter(_event: NostrEvent) {
        // Publish to ALL relays (including slow ones) for broad distribution
        return allRelayUrls.current;
      },
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current } as unknown as Parameters<typeof NostrContext.Provider>[0]['value']}>
      {children}
    </NostrContext.Provider>
  );
}

export default NostrProvider;
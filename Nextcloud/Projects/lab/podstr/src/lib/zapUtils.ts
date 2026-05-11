import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Extracts the zap amount from a zap receipt (kind 9735)
 * Tries multiple methods in order of reliability
 */
export function extractZapAmount(zapEvent: NostrEvent): number {
  // Method 1: Extract from bolt11 invoice (most reliable)
  const bolt11Tag = zapEvent.tags.find(([name]) => name === 'bolt11')?.[1];
  if (bolt11Tag) {
    try {
      // Extract amount from bolt11 invoice
      // Format: ln[testnet]<amount><multiplier><separator><data>
      // Look for amount after "ln" or "lntb" prefix and before separator (usually "1")
      const bolt11Lower = bolt11Tag.toLowerCase();
      
      // Find the amount part (after prefix, before "1" separator)
      let match;
      if (bolt11Lower.startsWith('lnbc')) {
        // Mainnet bitcoin
        match = bolt11Lower.match(/^lnbc(\d+)([munp]?)1/);
      } else if (bolt11Lower.startsWith('lntb')) {
        // Testnet bitcoin  
        match = bolt11Lower.match(/^lntb(\d+)([munp]?)1/);
      } else if (bolt11Lower.startsWith('ln')) {
        // Generic format
        match = bolt11Lower.match(/^ln(\d+)([munp]?)1/);
      }
      
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2];
        
        // Convert to sats based on unit
        switch (unit) {
          case 'm': // milli-bitcoin (100,000 sats)
            return amount * 100000;
          case 'u': // micro-bitcoin (100 sats)
            return amount * 100;
          case 'n': // nano-bitcoin (0.1 sats) 
            return Math.floor(amount / 10);
          case 'p': // pico-bitcoin (0.0001 sats)
            return Math.floor(amount / 10000);
          default: // bitcoin (100,000,000 sats)
            return amount * 100000000;
        }
      }
    } catch (error) {
      console.warn('Failed to parse bolt11 amount:', error);
    }
  }

  // Method 2: amount tag (from zap request, sometimes copied to receipt)
  const amountTag = zapEvent.tags.find(([name]) => name === 'amount')?.[1];
  if (amountTag) {
    const millisats = parseInt(amountTag);
    return Math.floor(millisats / 1000);
  }

  // Method 3: Parse from description (zap request JSON)
  const descriptionTag = zapEvent.tags.find(([name]) => name === 'description')?.[1];
  if (descriptionTag) {
    try {
      const zapRequest = JSON.parse(descriptionTag);
      if (zapRequest.tags) {
        const requestAmountTag = zapRequest.tags.find(([name]: string[]) => name === 'amount')?.[1];
        if (requestAmountTag) {
          const millisats = parseInt(requestAmountTag);
          return Math.floor(millisats / 1000);
        }
      }
    } catch (error) {
      console.warn('Failed to parse description JSON:', error);
    }
  }

  console.warn('Could not extract amount from zap receipt:', zapEvent.id);
  return 0;
}

/**
 * Extracts the actual zapper's pubkey from a zap receipt
 * The zapper's pubkey is in the P tag, not the event pubkey
 */
export function extractZapperPubkey(zapEvent: NostrEvent): string | null {
  // The actual zapper's pubkey is in the P tag, not the event pubkey
  const zapperPubkey = zapEvent.tags.find(([name]) => name === 'P')?.[1];
  
  if (!zapperPubkey) {
    // Fallback: try to extract from description (zap request)
    const descriptionTag = zapEvent.tags.find(([name]) => name === 'description')?.[1];
    if (descriptionTag) {
      try {
        const zapRequest = JSON.parse(descriptionTag);
        return zapRequest.pubkey || null;
      } catch (error) {
        console.warn('Failed to parse description JSON for zapper pubkey:', error);
      }
    }
  }
  
  return zapperPubkey || null;
}

/**
 * Validates that a Nostr event is a properly formatted zap receipt
 */
export function validateZapEvent(event: NostrEvent): boolean {
  if (event.kind !== 9735) return false;
  
  // Check for required tags
  const hasRecipient = event.tags.some(([name]) => name === 'p');
  const hasBolt11 = event.tags.some(([name]) => name === 'bolt11');
  const hasDescription = event.tags.some(([name]) => name === 'description');
  
  return hasRecipient && hasBolt11 && hasDescription;
}

/**
 * Extracts the event ID being zapped from a zap receipt
 */
export function extractZappedEventId(zapEvent: NostrEvent): string | null {
  // For regular events, use 'e' tag  
  const eventTag = zapEvent.tags.find(([name]) => name === 'e')?.[1];
  if (eventTag) return eventTag;
  
  // For addressable events, could parse 'a' tag, but that's more complex
  // For now, just return null if no 'e' tag
  return null;
}
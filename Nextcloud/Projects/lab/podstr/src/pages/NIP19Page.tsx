import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { EpisodePage } from '@/components/podcast/EpisodePage';
import { ArticlePage } from '@/components/article/ArticlePage';
import NotFound from './NotFound';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
    case 'nprofile':
      // AI agent should implement profile view here
      return <div>Profile placeholder</div>;

    case 'note': {
      // Handle note1 identifiers - could be podcast episodes (kind 54)
      const noteId = decoded.data;
      return (
        <EpisodePage
          eventId={noteId}
        />
      );
    }

    case 'nevent': {
      // Handle nevent1 identifiers - could be podcast episodes (kind 54)
      const nevent = decoded.data;
      return (
        <EpisodePage
          eventId={nevent.id}
        />
      );
    }

    case 'naddr': {
      // Handle addressable events (podcast episodes are kind 30054)
      const naddr = decoded.data;
      if (naddr.kind === 30054) {
        // This is a podcast episode - pass the addressable event parameters
        return (
          <EpisodePage
            addressableEvent={{
              pubkey: naddr.pubkey,
              kind: naddr.kind,
              identifier: naddr.identifier
            }}
          />
        );
      }
      if (naddr.kind === 30023) {
        // NIP-23 long-form article
        return (
          <ArticlePage
            addressableEvent={{
              pubkey: naddr.pubkey,
              kind: naddr.kind,
              identifier: naddr.identifier
            }}
          />
        );
      }
      // For other addressable event kinds, show placeholder
      return <div>Addressable event placeholder</div>;
    }

    default:
      return <NotFound />;
  }
}
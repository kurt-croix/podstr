import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface ProfileMentionProps {
  identifier: string; // npub1... or nprofile1...
  className?: string;
}

export function ProfileMention({ identifier, className }: ProfileMentionProps) {
  // Extract pubkey from either npub or nprofile
  const pubkey = (() => {
    try {
      const decoded = nip19.decode(identifier);
      if (decoded.type === 'npub') {
        return decoded.data;
      } else if (decoded.type === 'nprofile') {
        return decoded.data.pubkey;
      }
      return null;
    } catch {
      return null;
    }
  })();

  const author = useAuthor(pubkey || '');
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? (pubkey ? genUserName(pubkey) : identifier);

  if (!pubkey) {
    // Fallback for invalid identifiers
    return (
      <span className={cn("text-muted-foreground", className)}>
        @{identifier}
      </span>
    );
  }

  return (
    <Link 
      to={`/${identifier}`}
      className={cn(
        "font-medium hover:underline",
        hasRealName 
          ? "text-blue-500" 
          : "text-gray-500 hover:text-gray-700",
        className
      )}
    >
      @{displayName}
    </Link>
  );
}
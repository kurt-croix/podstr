import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { ProfileMention } from '@/components/ProfileMention';
import { InlineEmbeddedEvent } from '@/components/InlineEmbeddedEvent';
import { LinkPreview } from '@/components/social/LinkPreview';
import { extractMediaFromEvent, getMediaTypeFromUrl } from '@/lib/mediaUtils';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
  /** Whether to render link preview cards below the text (default: true) */
  showLinkPreviews?: boolean;
}

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event,
  className,
  showLinkPreviews = true,
}: NoteContentProps) {
  // Process the content to render mentions, links, etc.
  const { textParts, linkUrls } = useMemo(() => {
    const text = event.content;

    // Extract media URLs from the event to avoid showing them as text links
    const mediaItems = extractMediaFromEvent(event);
    const mediaUrls = new Set(mediaItems.map(item => item.url));

    // Regex to find URLs, Nostr references, and hashtags
    const regex = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

    const parts: React.ReactNode[] = [];
    const urls: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, url, nostrPrefix, nostrData, hashtag] = match;
      const index = match.index;

      // Add text before this match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }

      if (url) {
        // Skip URLs that are already being rendered as media
        if (mediaUrls.has(url) || getMediaTypeFromUrl(url)) {
          // Skip media URLs entirely
        } else {
          // Track for link preview cards
          urls.push(url);

          // Keep inline text link (short display)
          const displayUrl = url.length > 50 ? `${url.slice(0, 50)}...` : url;
          parts.push(
            <a
              key={`url-${keyCounter++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all inline-block max-w-full no-underline"
              title={url}
            >
              {displayUrl}
            </a>
          );
        }
      } else if (nostrPrefix && nostrData) {
        // Handle Nostr references
        try {
          const nostrId = `${nostrPrefix}${nostrData}`;
          const decoded = nip19.decode(nostrId);

          if (decoded.type === 'npub' || decoded.type === 'nprofile') {
            parts.push(
              <ProfileMention key={`mention-${keyCounter++}`} identifier={nostrId} />
            );
          } else if (decoded.type === 'note' || decoded.type === 'nevent') {
            parts.push(
              <InlineEmbeddedEvent key={`embed-${keyCounter++}`} identifier={nostrId} />
            );
          } else {
            parts.push(
              <Link
                key={`nostr-${keyCounter++}`}
                to={`/${nostrId}`}
                className="text-primary hover:underline"
              >
                {fullMatch}
              </Link>
            );
          }
        } catch {
          parts.push(fullMatch);
        }
      } else if (hashtag) {
        const tag = hashtag.slice(1);
        parts.push(
          <Link
            key={`hashtag-${keyCounter++}`}
            to={`/t/${tag}`}
            className="text-primary hover:underline"
          >
            {hashtag}
          </Link>
        );
      }

      lastIndex = index + fullMatch.length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    if (parts.length === 0) {
      parts.push(text);
    }

    return { textParts: parts, linkUrls: urls };
  }, [event]);

  // Deduplicate URLs for previews
  const uniqueUrls = [...new Set(linkUrls)];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="whitespace-pre-wrap break-words overflow-hidden">
        {textParts}
      </div>
      {showLinkPreviews && uniqueUrls.length > 0 && (
        <div className="space-y-2 mt-2">
          {uniqueUrls.map((url, i) => (
            <LinkPreview key={`preview-${i}`} url={url} />
          ))}
        </div>
      )}
    </div>
  );
}

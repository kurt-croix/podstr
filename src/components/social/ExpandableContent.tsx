import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteContent } from '@/components/NoteContent';
import { MediaRenderer } from './MediaRenderer';
import { PostActions } from './PostActions';
import { extractMediaFromEvent } from '@/lib/mediaUtils';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface ExpandableContentProps {
  event: NostrEvent;
  isCompact?: boolean;
  className?: string;
}

const MAX_CONTENT_LENGTH = 280; // Similar to Twitter's character limit for compact view

export function ExpandableContent({
  event,
  isCompact = false,
  className
}: ExpandableContentProps) {
  const [isExpanded, setIsExpanded] = useState(!isCompact);
  const mediaItems = extractMediaFromEvent(event);

  // Determine if content should be truncated
  const shouldTruncate = isCompact && event.content.length > MAX_CONTENT_LENGTH;
  const truncatedContent = shouldTruncate
    ? event.content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : event.content;

  // Create a truncated event for compact view
  const truncatedEvent = shouldTruncate
    ? { ...event, content: truncatedContent }
    : event;

  const displayEvent = isExpanded || !shouldTruncate ? event : truncatedEvent;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Content */}
      <div className="space-y-3">
        {displayEvent.content ? (
          <div className="prose prose-sm max-w-none overflow-hidden prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
            <NoteContent event={displayEvent} className="text-sm" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No content
          </p>
        )}

        {/* Render attached media (only show in expanded view or if not truncated) */}
        {(isExpanded || !shouldTruncate) && mediaItems.length > 0 && (
          <MediaRenderer media={mediaItems} className="mt-3" />
        )}
      </div>

      {/* Expand/Collapse Button */}
      {shouldTruncate && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpand}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Show more
              </>
            )}
          </Button>
        </div>
      )}

      {/* Post Actions (only show in expanded view or if not truncated) */}
      {(isExpanded || !shouldTruncate) && (
        <PostActions event={event} />
      )}
    </div>
  );
}
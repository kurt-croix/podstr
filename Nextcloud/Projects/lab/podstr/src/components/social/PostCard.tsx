import { formatDistanceToNow } from 'date-fns';
import { Repeat, Heart, MoreHorizontal, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ExpandableContent } from './ExpandableContent';
import { RepostCard } from './RepostCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteNote } from '@/hooks/useDeleteNote';
import { genUserName } from '@/lib/genUserName';
import { isPodcastCreator } from '@/lib/podcastConfig';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

interface PostCardProps {
  event: NostrEvent;
  isCompact?: boolean;
  className?: string;
}

export function PostCard({ event, isCompact = false, className }: PostCardProps) {
  const { data: author } = useAuthor(event.pubkey);
  const { user } = useCurrentUser();
  const { mutate: deleteNote, isPending: isDeleting } = useDeleteNote();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Handle reposts with a specialized component
  if (event.kind === 6 || event.kind === 16) {
    return <RepostCard event={event} className={className} />;
  }

  // Check if current user can delete this note (must be the creator and the author)
  const canDelete = user && 
    isPodcastCreator(user.pubkey) && 
    event.pubkey === user.pubkey;

  const handleDelete = () => {
    deleteNote(event);
    setShowDeleteDialog(false);
  };

  const metadata = author?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(event.pubkey);
  const postDate = new Date(event.created_at * 1000);

  const getPostTypeInfo = () => {
    switch (event.kind) {
      case 1:
        return { icon: null, label: null, bgColor: '' };
      case 6:
        return {
          icon: <Repeat className="w-4 h-4" />,
          label: 'reposted',
          bgColor: 'bg-green-50 dark:bg-green-950'
        };
      case 7:
        return {
          icon: <Heart className="w-4 h-4" />,
          label: 'liked',
          bgColor: 'bg-red-50 dark:bg-red-950'
        };
      default:
        return { icon: null, label: null, bgColor: '' };
    }
  };

  const { icon, label, bgColor } = getPostTypeInfo();

  return (
    <Card className={cn(className, bgColor)}>
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback>
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <p className="font-semibold">{displayName}</p>
                {icon && (
                  <>
                    {icon}
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </>
                )}
                <span className="text-sm text-muted-foreground">•</span>
                <time className="text-sm text-muted-foreground">
                  {formatDistanceToNow(postDate, { addSuffix: true })}
                </time>
              </div>

              {/* Delete menu - only show for creator's own notes */}
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete note
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Use ExpandableContent for the post content */}
            <ExpandableContent
              event={event}
              isCompact={isCompact}
            />
          </div>
        </div>
      </CardContent>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone and will remove the note from the network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
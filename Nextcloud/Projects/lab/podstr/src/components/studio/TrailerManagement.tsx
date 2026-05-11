import { useState } from 'react';
import { format } from 'date-fns';
import {
  Trash2,
  Play,
  Pause,
  MoreHorizontal,
  ExternalLink,
  Calendar,
  Volume2,
  Hash,
  AlertTriangle,
  Plus,
  Video,
  Music
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePodcastTrailers } from '@/hooks/usePodcastTrailers';
import { useDeleteTrailer } from '@/hooks/usePublishTrailer';
import { useToast } from '@/hooks/useToast';
import { PublishTrailerForm } from '@/components/podcast/PublishTrailerForm';
import type { PodcastTrailer } from '@/types/podcast';

interface TrailerManagementProps {
  className?: string;
}

export function TrailerManagement({ className }: TrailerManagementProps) {
  const { toast } = useToast();
  const { mutateAsync: deleteTrailer, isPending: isDeleting } = useDeleteTrailer();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'season'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [trailerToDelete, setTrailerToDelete] = useState<PodcastTrailer | null>(null);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  const { data: allTrailers, isLoading, error } = usePodcastTrailers();

  // Filter and sort trailers
  const filteredTrailers = allTrailers?.filter(trailer => {
    if (!searchQuery) return true;
    return trailer.title.toLowerCase().includes(searchQuery.toLowerCase());
  }).sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'season':
        comparison = (a.season || 0) - (b.season || 0);
        break;
      case 'date':
      default:
        comparison = a.pubDate.getTime() - b.pubDate.getTime();
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  const handleDeleteTrailer = async (trailer: PodcastTrailer) => {
    try {
      await deleteTrailer(trailer.eventId);

      toast({
        title: 'Trailer deleted',
        description: `"${trailer.title}" has been deleted and RSS feed updated.`,
      });

      setTrailerToDelete(null);
    } catch (error) {
      toast({
        title: 'Failed to delete trailer',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const getTrailerIcon = (type?: string) => {
    if (!type) return <Volume2 className="w-8 h-8 text-muted-foreground" />;
    
    if (type.startsWith('video/')) {
      return <Video className="w-8 h-8 text-blue-600" />; // Blue color for video
    } else if (type.startsWith('audio/')) {
      return <Music className="w-8 h-8 text-green-600" />; // Green color for audio
    }
    
    return <Volume2 className="w-8 h-8 text-muted-foreground" />;
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  if (showPublishForm) {
    return (
      <div className={className}>
        <PublishTrailerForm
          onSuccess={() => {
            setShowPublishForm(false);
            toast({
              title: 'Trailer published!',
              description: 'Your trailer has been added to the RSS feed.',
            });
          }}
          onCancel={() => setShowPublishForm(false)}
        />
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-12 px-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Failed to load trailers</h3>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An error occurred while loading trailers'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Play className="w-5 h-5" />
              <span>Trailer Management</span>
              {filteredTrailers && (
                <Badge variant="secondary">
                  {filteredTrailers.length} trailer{filteredTrailers.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <Button onClick={() => setShowPublishForm(true)} size="sm" className="text-sm">
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">New Trailer</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="flex-1">
              <Input
                placeholder="Search trailers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Select value={sortBy} onValueChange={(value: 'date' | 'title' | 'season') => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="season">Season</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(order => order === 'desc' ? 'asc' : 'desc')}
              >
                {sortOrder === 'desc' ? '↓' : '↑'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="border">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <Skeleton className="w-20 h-20 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <Skeleton className="w-8 h-8" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !filteredTrailers || filteredTrailers.length === 0 ? (
            <div className="text-center py-12">
              <Play className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? 'No trailers found' : 'No trailers yet'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Create promotional audio or video trailers to give listeners a preview of your podcast'
                }
              </p>
              <Button onClick={() => setShowPublishForm(true)} size="sm" className="text-sm">
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Create First Trailer</span>
                <span className="sm:hidden">Create Trailer</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTrailers.map((trailer) => (
                <Card key={trailer.id} className="border transition-colors hover:bg-muted/50">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      {/* Trailer Type Icon */}
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                        {getTrailerIcon(trailer.type)}
                      </div>

                      {/* Trailer Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate mb-1">
                              {trailer.title}
                            </h3>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-2">
                              {trailer.season && (
                                <span className="flex items-center space-x-1">
                                  <Hash className="w-3 h-3" />
                                  <span>Season {trailer.season}</span>
                                </span>
                              )}
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-3 h-3" />
                                <span>{format(trailer.pubDate, 'MMM d, yyyy')}</span>
                              </span>
                              {trailer.length && (
                                <span className="text-xs">
                                  {formatFileSize(trailer.length)}
                                </span>
                              )}
                              {trailer.type && (
                                <Badge 
                                  variant={trailer.type.startsWith('video/') ? "default" : "outline"}
                                  className={`text-xs ${trailer.type.startsWith('video/') ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}`}
                                >
                                  {trailer.type.startsWith('video/') ? '🎥 Video' : '🎵 Audio'}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Actions Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setCurrentlyPlaying(
                                  currentlyPlaying === trailer.id ? null : trailer.id
                                )}
                              >
                                {currentlyPlaying === trailer.id ? (
                                  <Pause className="w-4 h-4 mr-2" />
                                ) : (
                                  <Play className="w-4 h-4 mr-2" />
                                )}
                                {currentlyPlaying === trailer.id ? 'Hide Player' : 'Play Trailer'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (trailer.url) {
                                    window.open(trailer.url, '_blank');
                                  }
                                }}
                                disabled={!trailer.url}
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open Trailer File
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setTrailerToDelete(trailer)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Trailer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Media Player */}
                        {currentlyPlaying === trailer.id && trailer.url && (
                          <div className="mt-4 pt-4 border-t">
                            {trailer.type?.startsWith('video/') ? (
                              <div className="bg-black rounded-lg overflow-hidden max-w-lg">
                                <video 
                                  controls 
                                  className="w-full h-auto"
                                  preload="metadata"
                                  poster="" // You could add a poster frame if available
                                >
                                  <source src={trailer.url} type={trailer.type} />
                                  Your browser does not support the video tag.
                                </video>
                              </div>
                            ) : (
                              <audio 
                                controls 
                                className="w-full max-w-md"
                                preload="metadata"
                              >
                                <source src={trailer.url} type={trailer.type || 'audio/mpeg'} />
                                Your browser does not support the audio tag.
                              </audio>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!trailerToDelete}
        onOpenChange={() => setTrailerToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trailer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{trailerToDelete?.title}"?
              This action cannot be undone and will also update your RSS feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => trailerToDelete && handleDeleteTrailer(trailerToDelete)}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Trailer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
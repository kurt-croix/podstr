import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { encodeEpisodeAsNaddr } from '@/lib/nip19Utils';
import { EpisodeActions } from '@/components/podcast/EpisodeActions';
import { CommentsSection } from '@/components/comments/CommentsSection';

import type { NostrEvent } from '@nostrify/nostrify';

export function PersistentAudioPlayer() {
  const {
    state,
    play,
    pause,
    stop,
    seekTo,
    setVolume,
    setPlaybackRate
  } = useAudioPlayer();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(1);

  // Don't render if no episode is loaded
  if (!state.currentEpisode) {
    return null;
  }

  const episode = state.currentEpisode;
  const episodeNaddr = encodeEpisodeAsNaddr(episode.authorPubkey, episode.identifier);

  // Create NostrEvent for social features - must match the real episode event structure
  // For addressable events (kind 30054), comments are identified by #a tag: kind:pubkey:identifier
  // CRITICAL: Use the same identifier logic as everywhere else in the app
  const episodeIdentifier = episode.identifier || episode.eventId;
  
  const episodeEvent: NostrEvent = {
    id: episode.eventId, // Real event ID from the episode
    pubkey: episode.authorPubkey,
    created_at: Math.floor(episode.createdAt.getTime() / 1000),
    kind: 30054, // Addressable podcast episode
    tags: [
      ['d', episodeIdentifier], // CRITICAL: Must match identifier logic used in EpisodePage
      ['title', episode.title],
      ['audio', episode.audioUrl, episode.audioType || 'audio/mpeg'],
      ...(episode.description ? [['description', episode.description]] : []),
      ...(episode.imageUrl ? [['image', episode.imageUrl]] : []),
      ...episode.tags.map(tag => ['t', tag])
    ],
    content: episode.content || '',
    sig: ''
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleSeek = (value: number[]) => {
    seekTo(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleMuteToggle = () => {
    if (isMuted) {
      setVolume(previousVolume);
      setIsMuted(false);
    } else {
      setPreviousVolume(state.volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleSkipBack = () => {
    seekTo(Math.max(0, state.currentTime - 15));
  };

  const handleSkipForward = () => {
    seekTo(Math.min(state.duration, state.currentTime + 15));
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Main Player Bar */}
        <div className="px-4 py-3">
          {/* Episode Info Row */}
          <div className="flex items-center space-x-3 mb-3">
            {episode.imageUrl && (
              <img
                src={episode.imageUrl}
                alt={episode.title}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <Link
                to={`/${episodeNaddr}`}
                className="font-medium text-xs sm:text-sm hover:text-primary transition-colors line-clamp-1"
              >
                {episode.title}
              </Link>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                {state.error && (
                  <Badge variant="destructive" className="text-xs">
                    Error
                  </Badge>
                )}
                {state.isLoading && (
                  <Badge variant="secondary" className="text-xs">
                    Loading...
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Expand & Close Controls - Top right */}
            <div className="flex items-center space-x-1">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </Button>
              </CollapsibleTrigger>

              <Button
                variant="ghost"
                size="sm"
                onClick={stop}
                className="h-8 w-8 sm:h-9 sm:w-9 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>

          {/* Playback Controls Row - Centered on desktop, full width on mobile */}
          <div className="flex items-center justify-center sm:justify-center space-x-3 sm:space-x-4 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipBack}
              disabled={!episode.audioUrl}
              className="h-10 w-10 sm:h-11 sm:w-11 p-0"
            >
              <SkipBack className="h-5 w-5 sm:h-6 sm:w-6" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handlePlayPause}
              disabled={!episode.audioUrl || state.isLoading}
              className="h-12 w-12 sm:h-14 sm:w-14 p-0 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {state.isPlaying ? (
                <Pause className="h-6 w-6 sm:h-7 sm:w-7" />
              ) : (
                <Play className="h-6 w-6 sm:h-7 sm:w-7 ml-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipForward}
              disabled={!episode.audioUrl}
              className="h-10 w-10 sm:h-11 sm:w-11 p-0"
            >
              <SkipForward className="h-5 w-5 sm:h-6 sm:w-6" />
            </Button>

            {/* Volume Controls - Visible on desktop only */}
            <div className="hidden sm:flex items-center space-x-2 ml-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMuteToggle}
                className="h-9 w-9 p-0"
              >
                {isMuted || state.volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>

              <div className="w-20">
                <Slider
                  value={[isMuted ? 0 : state.volume]}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Episode Actions Row - Centered */}
          <div className="flex items-center justify-center mb-2">
            <EpisodeActions
              episode={episode}
              showComments={showComments}
              onToggleComments={() => {
                if (!showComments) {
                  // Auto-expand player and show comments
                  setIsExpanded(true);
                  setShowComments(true);
                } else {
                  // Just toggle comments off
                  setShowComments(false);
                }
              }}
              className="scale-110 sm:scale-100"
            />
          </div>

          {/* Bottom Row: Progress Bar & Time */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Slider
                value={[state.currentTime]}
                max={state.duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="cursor-pointer"
                disabled={!episode.audioUrl || state.isLoading}
              />
            </div>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground min-w-0 flex-shrink-0">
              <span>{formatTime(state.currentTime)}</span>
              <span>/</span>
              <span>{formatTime(state.duration)}</span>
            </div>
          </div>
        </div>

        {/* Expanded Controls */}
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t max-h-[70vh] sm:max-h-none overflow-y-auto">
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {/* Episode Details */}
                  <div>
                    <h4 className="font-semibold mb-2">Now Playing</h4>
                    <div className="flex items-start space-x-3">
                      {episode.imageUrl && (
                        <img
                          src={episode.imageUrl}
                          alt={episode.title}
                          className="w-16 h-16 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/${episodeNaddr}`}
                          className="font-medium hover:text-primary transition-colors block"
                        >
                          {episode.title}
                        </Link>
                        {episode.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {episode.description}
                          </p>
                        )}
                        {episode.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {episode.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                #{tag}
                              </Badge>
                            ))}
                            {episode.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{episode.tags.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Volume & Playback Speed */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Volume Controls - Visible on mobile in expanded view */}
                    <div className="sm:hidden">
                      <h4 className="font-semibold mb-2">Volume</h4>
                      <div className="flex items-center space-x-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleMuteToggle}
                          className="h-8 w-8 p-0"
                        >
                          {isMuted || state.volume === 0 ? (
                            <VolumeX className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </Button>
                        <div className="flex-1">
                          <Slider
                            value={[isMuted ? 0 : state.volume]}
                            max={1}
                            step={0.1}
                            onValueChange={handleVolumeChange}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Playback Speed */}
                    <div>
                      <h4 className="font-semibold mb-2">Playback Speed</h4>
                      <div className="flex items-center space-x-2 flex-wrap">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <Button
                            key={rate}
                            variant={state.playbackRate === rate ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePlaybackRateChange(rate)}
                            className="text-xs"
                          >
                            {rate}×
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>


                  {/* Comments Section */}
                  {showComments && (
                    <div>
                      <h4 className="font-semibold mb-2">Episode Discussion</h4>
                      <div className="max-h-60 sm:max-h-96 overflow-y-auto">
                        <CommentsSection
                          root={episodeEvent}
                          title=""
                          emptyStateMessage="No comments yet"
                          emptyStateSubtitle="Be the first to share your thoughts about this episode!"
                          limit={50}
                        />
                      </div>
                    </div>
                  )}

                  {/* Additional Episode Actions */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="text-sm text-muted-foreground">
                      Playing from {window.location.hostname}
                    </div>
                    <Link
                      to={`/${episodeNaddr}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View Episode Page
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
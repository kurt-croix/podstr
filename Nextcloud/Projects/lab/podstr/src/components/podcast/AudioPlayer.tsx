import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { EpisodeActions } from './EpisodeActions';
import type { PodcastEpisode } from '@/types/podcast';

interface AudioPlayerProps {
  episode: PodcastEpisode;
  className?: string;
  autoPlay?: boolean;
}

export function AudioPlayer({ episode, className, autoPlay = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize error state on mount
  useEffect(() => {
    if (!episode.audioUrl) {
      setError('No audio URL provided for this episode');
    } else {
      setError(null);
    }
  }, [episode]);

  // Auto-play effect when episode changes
  useEffect(() => {
    if (autoPlay && episode.audioUrl) {
      const audio = audioRef.current;
      if (audio) {
        // Small delay to ensure audio element is ready
        const timer = setTimeout(async () => {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch {
            // Auto-play failed (likely blocked by browser policy)
          }
        }, 100);
        
        return () => clearTimeout(timer);
      }
    }
  }, [episode.id, autoPlay, episode.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleLoadStart = () => {
      setLoading(true);
      setError(null);
    };
    const handleCanPlay = () => {
      setLoading(false);
      setError(null);
    };
    const handleEnded = () => {
      setIsPlaying(false);
    };
    const handleError = (e: Event) => {
      const audioElement = e.target as HTMLAudioElement;
      const errorMessage = audioElement.error?.message;
      setLoading(false);
      setIsPlaying(false);
      setError(`Failed to load audio: ${errorMessage || 'Unknown error'}`);
    };
    const handleLoadedData = () => {
      setLoading(false);
      setError(null);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadeddata', handleLoadedData);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        setLoading(true);
        await audio.play();
        setIsPlaying(true);
        setLoading(false);
        setError(null);
      } catch (error) {
        setLoading(false);
        setIsPlaying(false);
        setError(`Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const skipBackward = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, audio.currentTime - 15);
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.min(duration, audio.currentTime + 15);
  };

  const formatTime = (time: number): string => {
    if (isNaN(time)) return '0:00';
    
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <audio
          ref={audioRef}
          src={episode.audioUrl}
          preload="metadata"
          crossOrigin="anonymous"
        />
        
        <div className="space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-xs text-red-600 mt-1 font-mono break-all">
                URL: {episode.audioUrl || 'No audio URL'}
              </p>
              {episode.audioType && (
                <p className="text-xs text-red-600 font-mono">
                  Type: {episode.audioType}
                </p>
              )}
            </div>
          )}
          
          {/* Episode Info */}
          <div className="flex items-center space-x-3">
            {episode.imageUrl && (
              <img
                src={episode.imageUrl}
                alt={episode.title}
                className="w-12 h-12 rounded object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{episode.title}</h3>
              <p className="text-sm text-muted-foreground truncate">
                Episode {episode.episodeNumber}
              </p>
            </div>
          </div>

          {/* Social Actions */}
          <div className="flex justify-center">
            <EpisodeActions episode={episode} />
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="w-full"
              disabled={loading || !duration}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={skipBackward}
                disabled={loading}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={togglePlay}
                disabled={loading || !episode.audioUrl}
                size="sm"
                title={!episode.audioUrl ? 'No audio URL available' : isPlaying ? 'Pause' : 'Play'}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={skipForward}
                disabled={loading}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.1}
                onValueChange={handleVolumeChange}
                className="w-20"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
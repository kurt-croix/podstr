import { useState, useRef, useEffect, ReactNode } from 'react';
import { AudioPlayerContext, type AudioPlayerState, type AudioPlayerContextType } from './AudioPlayerContext';
import type { PodcastEpisode } from '@/types/podcast';

interface AudioPlayerProviderProps {
  children: ReactNode;
}

export function AudioPlayerProvider({ children }: AudioPlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [state, setState] = useState<AudioPlayerState>({
    currentEpisode: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    playbackRate: 1,
    isLoading: false,
    error: null,
  });

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
    };

    const handleLoadedMetadata = () => {
      setState(prev => ({
        ...prev,
        duration: audio.duration || 0,
        isLoading: false
      }));
    };

    const handleTimeUpdate = () => {
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };

    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleEnded = () => {
      setState(prev => ({
        ...prev,
        isPlaying: false,
        currentTime: 0
      }));
    };

    const handleError = () => {
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isLoading: false,
        error: 'Failed to load audio'
      }));
    };

    const handleVolumeChange = () => {
      setState(prev => ({ ...prev, volume: audio.volume }));
    };

    const handleRateChange = () => {
      setState(prev => ({ ...prev, playbackRate: audio.playbackRate }));
    };

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('ratechange', handleRateChange);

    // Cleanup
    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.removeEventListener('ratechange', handleRateChange);
    };
  }, []);

  // Actions
  const playEpisode = (episode: PodcastEpisode) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If it's a different episode, load it
    if (state.currentEpisode?.eventId !== episode.eventId) {
      setState(prev => ({
        ...prev,
        currentEpisode: episode,
        currentTime: 0,
        error: null
      }));

      audio.src = episode.audioUrl;
      audio.load();
    }

    // Play the episode
    audio.play().catch(error => {
      console.error('Failed to play audio:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to play audio',
        isLoading: false
      }));
    });
  };

  const play = () => {
    const audio = audioRef.current;
    if (!audio || !state.currentEpisode) return;

    audio.play().catch(error => {
      console.error('Failed to play audio:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to play audio'
      }));
    });
  };

  const pause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setState(prev => ({
      ...prev,
      currentEpisode: null,
      currentTime: 0,
      isPlaying: false
    }));
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(time, state.duration));
  };

  const setVolume = (volume: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const clampedVolume = Math.max(0, Math.min(1, volume));
    audio.volume = clampedVolume;
  };

  const setPlaybackRate = (rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const clampedRate = Math.max(0.25, Math.min(3, rate));
    audio.playbackRate = clampedRate;
  };

  const contextValue: AudioPlayerContextType = {
    state,
    playEpisode,
    play,
    pause,
    stop,
    seekTo,
    setVolume,
    setPlaybackRate,
    audioRef,
  };

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        preload="metadata"
        style={{ display: 'none' }}
      />
    </AudioPlayerContext.Provider>
  );
}


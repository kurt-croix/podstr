import { createContext } from 'react';
import type { PodcastEpisode } from '@/types/podcast';

interface AudioPlayerState {
  currentEpisode: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

interface AudioPlayerContextType {
  // State
  state: AudioPlayerState;

  // Actions
  playEpisode: (episode: PodcastEpisode) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;

  // Audio element ref for direct access if needed
  audioRef: React.RefObject<HTMLAudioElement>;
}

export const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export type { AudioPlayerState, AudioPlayerContextType };
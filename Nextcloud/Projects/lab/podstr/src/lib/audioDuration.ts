/**
 * Utility functions for detecting audio file duration
 */

/**
 * Get duration using Web Audio API (fallback method)
 */
async function getAudioDurationWebAudio(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported in this browser');
    }
    const audioContext = new AudioContextClass();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return Math.round(audioBuffer.duration);
  } catch (error) {
    throw new Error(`Web Audio API failed to decode audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get duration of an audio file in seconds (HTML Audio method)
 */
function getAudioDurationHTML(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('canplaythrough', onCanPlayThrough);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        cleanup();
        resolve(Math.round(audio.duration));
      }
    };

    const onCanPlayThrough = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        cleanup();
        resolve(Math.round(audio.duration));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio metadata: ${audio.error?.message || 'Unknown error'}`));
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('canplaythrough', onCanPlayThrough);

    // Set up a timeout to avoid hanging indefinitely
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Duration detection timed out'));
    }, 10000); // 10 second timeout

    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timeout);
    });

    audio.addEventListener('error', () => {
      clearTimeout(timeout);
    });

    audio.preload = 'metadata';
    audio.src = url;
  });
}

/**
 * Get duration of an audio file in seconds (tries multiple methods)
 */
export async function getAudioDuration(file: File): Promise<number> {
  try {
    // Try HTML Audio method first (faster for most cases)
    return await getAudioDurationHTML(file);
  } catch {
    // Fallback to Web Audio API
    try {
      return await getAudioDurationWebAudio(file);
    } catch {
      throw new Error('Could not detect audio duration using any method');
    }
  }
}

/**
 * Get duration of an audio file from URL
 */
export function getAudioDurationFromUrl(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();

    audio.addEventListener('loadedmetadata', () => {
      resolve(Math.round(audio.duration));
    });

    audio.addEventListener('error', () => {
      reject(new Error('Failed to load audio metadata from URL'));
    });

    audio.crossOrigin = 'anonymous';
    audio.src = url;
  });
}

/**
 * Format duration in seconds to HH:MM:SS format for iTunes RSS
 */
export function formatDurationForRSS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Format duration in seconds to a human-readable string
 */
export function formatDurationHuman(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
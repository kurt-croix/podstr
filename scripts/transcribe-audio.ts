/**
 * Transcription script for podcast episodes using WhisperX
 *
 * This script:
 * - Reads episode metadata from a JSON file
 * - Downloads audio files
 * - Runs WhisperX with speaker diarization
 * - Saves transcripts to /transcripts folder
 * - Outputs a mapping of episode IDs to transcript paths
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { EpisodeMetadata } from './lib/conversion-types';
import type { NostrEvent } from '@nostrify/nostrify';
import { queryRelay } from './lib/relay-query';

interface TranscriptionResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  error?: string;
  event?: NostrEvent; // Original episode event to avoid re-fetching
}

const TRANSCRIPTS_DIR = path.resolve('transcripts');
const EPISODES_JSON_PATH = path.resolve('.episodes-to-transcribe.json');
const TRANSCRIPT_MAPPING_PATH = path.resolve('.transcript-mapping.json');
const BASE_URL = process.env.BASE_URL || 'https://shepherd.github.io/podstr';

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Try to resolve a fallback audio URL from the livestream event's recording tag.
 * Episode events have a `livestream` tag like ["livestream", "30311:<pubkey>:<d-tag>"].
 */
async function resolveRecordingFallback(episodeEvent: NostrEvent | undefined): Promise<string | null> {
  if (!episodeEvent) return null;

  const livestreamRef = episodeEvent.tags.find(([name]) => name === 'livestream')?.[1];
  if (!livestreamRef) return null;

  // Parse "30311:<pubkey>:<d-tag>"
  const parts = livestreamRef.split(':');
  if (parts.length < 3 || parts[0] !== '30311') return null;

  const [, pubkey, dTag] = parts;
  console.log(`🔍 Looking up livestream for recording fallback: ${dTag}`);

  try {
    const events = await queryRelay('wss://nos.lol', {
      kinds: [30311],
      authors: [pubkey],
      '#d': [dTag],
      limit: 1,
    });

    if (events.length === 0) return null;

    const recording = events[0].tags.find(([name]) => name === 'recording')?.[1];
    if (recording) {
      console.log(`✅ Found recording fallback: ${recording.substring(0, 80)}...`);
      return recording;
    }
  } catch (error) {
    console.warn(`⚠️  Failed to fetch livestream for fallback:`, error);
  }

  return null;
}

/**
 * Download file from URL
 * For m3u8/HLS URLs, uses ffmpeg to download and convert.
 * For direct URLs, uses plain fetch.
 */
async function downloadFile(url: string, filepath: string): Promise<void> {
  console.log(`📥 Downloading: ${url}`);

  // m3u8 is a playlist format — must use ffmpeg to fetch segments
  if (url.includes('.m3u8')) {
    await downloadHls(url, filepath);
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(filepath, Buffer.from(buffer));

  console.log(`✅ Downloaded to: ${filepath}`);
}

/**
 * Download HLS/m3u8 stream using ffmpeg
 */
async function downloadHls(url: string, filepath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cmd = `ffmpeg -i "${url}" -acodec libmp3lame -ab 128k "${filepath}" -y 2>/dev/null`;
    console.log(`🎬 Downloading HLS stream via ffmpeg...`);

    exec(cmd, (error) => {
      if (error) {
        reject(new Error(`ffmpeg HLS download failed: ${error.message}`));
        return;
      }
      console.log(`✅ HLS downloaded to: ${filepath}`);
      resolve();
    });
  });
}

/**
 * Extract first N seconds of audio file for testing
 */
async function extractAudioSegment(inputPath: string, outputPath: string, durationSeconds: number = 120): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Use audio codec conversion instead of copy to handle video files
    const cmd = `ffmpeg -i "${inputPath}" -t ${durationSeconds} -acodec libmp3lame -ab 128k "${outputPath}" -y 2>/dev/null`;
    console.log(`🎬 Extracting first ${durationSeconds} seconds for testing...`);

    exec(cmd, (error, _stdout, _stderr) => {
      if (error) {
        console.error('❌ FFmpeg error:', error.message);
        reject(new Error(`FFmpeg failed: ${error.message}`));
        return;
      }
      console.log(`✅ Audio segment extracted to: ${outputPath}`);
      resolve();
    });
  });
}

/**
 * Run WhisperX on audio file with diarization
 */
async function runWhisperX(audioPath: string, outputPath: string): Promise<void> {
  const hfToken = process.env.HF_TOKEN;
  const testMode = process.env.TEST_MODE === 'true';
  const timeoutMinutes = testMode ? 10 : 360; // 10 minutes in test mode, 6 hours normally

  // Extract short segment for testing
  let audioToTranscribe = audioPath;
  if (testMode) {
    const tempDir = path.dirname(audioPath);
    const basename = path.basename(audioPath, path.extname(audioPath));
    const segmentPath = path.join(tempDir, `${basename}_segment.mp3`);

    await extractAudioSegment(audioPath, segmentPath, 120); // Extract first 2 minutes
    audioToTranscribe = segmentPath;
  }

  if (!hfToken) {
    throw new Error('HF_TOKEN environment variable is required for WhisperX');
  }

  console.log(`🎙️  Running WhisperX on: ${audioToTranscribe}`);
  if (testMode) {
    console.log(`⚡ TEST MODE: Transcribing 2-minute segment with 10-minute timeout`);
  }

  // WhisperX command with pyannote/speaker-diarization-3.1 for speaker identification
  // Generate SRT format for PodcastIndex compliance
  // Login first, then run whisperx with progress bar and real-time output
  const loginCmd = `huggingface-cli login --token ${hfToken}`;
  const whisperArgs = [
    audioToTranscribe,
    '--output_dir', path.dirname(outputPath),
    '--output_format', 'srt',
    '--model', 'large-v3',
    '--language', 'en',
    '--diarize',
    '--diarize_model', 'pyannote/speaker-diarization-3.1',
    '--hf_token', hfToken,
    '--print_progress', 'True',
  ];

  console.log(`🔧 Logging into Hugging Face...`);

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`WhisperX transcription timed out after ${timeoutMinutes} minutes`));
    }, timeoutMinutes * 60 * 1000);
  });

  // Create execution promise using spawn for real-time output streaming
  const executionPromise = new Promise<void>((resolve, reject) => {
    // Step 1: Login to HF
    exec(loginCmd, (loginError) => {
      if (loginError) {
        console.error('❌ HF login failed:', loginError.message);
        reject(new Error(`HF login failed: ${loginError.message}`));
        return;
      }
      console.log(`✅ HF login successful`);
      console.log(`🎙️  Starting WhisperX with progress output...`);
      console.log(`🔧 whisperx ${whisperArgs.filter(a => !a.startsWith('hf_')).join(' ')}`);

      // Step 2: Run whisperx with spawn for real-time output
      const proc = spawn('whisperx', whisperArgs);

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          console.log(`  ${line}`);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          // Progress bars and status go to stderr
          if (line.includes('%') || line.includes('|')) {
            // Overwrite-style progress - just log it
            process.stdout.write(`  ${line}\r`);
          } else {
            console.log(`  ${line}`);
          }
        }
      });

      proc.on('close', async (code) => {
        // Clean up segment file if it exists
        if (testMode && audioToTranscribe !== audioPath) {
          fs.unlink(audioToTranscribe).catch(() => {});
        }

        if (code !== 0) {
          console.error(`❌ WhisperX exited with code ${code}`);
          reject(new Error(`WhisperX failed with exit code ${code}`));
          return;
        }

        console.log('✅ WhisperX completed successfully');

        // WhisperX creates a .srt file in the output directory
        const inputBasename = path.basename(audioToTranscribe, path.extname(audioToTranscribe));
        const srtFile = path.join(path.dirname(outputPath), `${inputBasename}.srt`);

        // Add test mode note to SRT transcript
        if (testMode) {
          let srtContent = await fs.readFile(srtFile, 'utf-8');
          srtContent = 'NOTE TEST MODE TRANSCRIPT - First 2 minutes only\n\n' + srtContent;
          await fs.writeFile(srtFile, srtContent);
        }

        // Move/rename to the desired output path
        try {
          await fs.rename(srtFile, outputPath);
          console.log(`✅ Transcript saved to: ${outputPath}`);
          resolve();
        } catch (err) {
          console.error('❌ Failed to move transcript:', err);
          reject(err);
        }
      });

      proc.on('error', (err) => {
        console.error('❌ Failed to spawn whisperx:', err.message);
        reject(new Error(`Failed to spawn whisperx: ${err.message}`));
      });
    });
  });

  // Race between execution and timeout
  await Promise.race([executionPromise, timeoutPromise]);
}

/**
 * Transcribe a single episode
 */
async function transcribeEpisode(episode: EpisodeMetadata, tempDir: string): Promise<TranscriptionResult> {
  const dTag = episode.dTag;
  const title = episode.title;
  const audioUrl = episode.audioUrl;

  console.log(`\n🎙️  Transcribing episode: ${title} (${dTag})`);

  const safeTitle = sanitizeFilename(title);
  const timestamp = episode.timestamp || Date.now();
  const audioFilename = `${safeTitle}-${timestamp}.mp3`;
  const transcriptFilename = `${safeTitle}-${timestamp}.srt`;

  const audioPath = path.join(tempDir, audioFilename);
  const transcriptPath = path.join(TRANSCRIPTS_DIR, transcriptFilename);
  const transcriptUrl = `${BASE_URL}/transcripts/${transcriptFilename}`;

  try {
    // Download audio (try primary URL, fallback to recording on 404)
    let downloadUrl = audioUrl;
    try {
      await downloadFile(downloadUrl, audioPath);
    } catch (downloadError) {
      const msg = downloadError instanceof Error ? downloadError.message : '';
      if (msg.includes('404')) {
        console.log(`⚠️  Primary URL returned 404, trying recording fallback...`);
        const fallbackUrl = await resolveRecordingFallback(episode.event);
        if (fallbackUrl) {
          downloadUrl = fallbackUrl;
          await downloadFile(downloadUrl, audioPath);
        } else {
          throw downloadError;
        }
      } else {
        throw downloadError;
      }
    }

    // Run WhisperX
    await runWhisperX(audioPath, transcriptPath);

    // Cleanup audio file
    await fs.unlink(audioPath);

    return {
      dTag,
      transcriptPath,
      transcriptUrl,
      success: true,
      event: episode.event, // Include original event to avoid re-fetching
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to transcribe episode ${dTag}:`, errorMessage);

    // Cleanup audio file if it exists
    try {
      await fs.unlink(audioPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      dTag,
      transcriptPath: '',
      transcriptUrl: '',
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Main transcription function
 */
async function main() {
  console.log('🎙️  Starting audio transcription with WhisperX...');

  // Check if HF_TOKEN is set
  if (!process.env.HF_TOKEN) {
    console.error('❌ HF_TOKEN environment variable is required');
    console.error('   Please set HF_TOKEN in your GitHub Actions secrets');
    process.exit(1);
  }

  // Read episode metadata
  let episodes: EpisodeMetadata[] = [];
  try {
    const episodesJson = await fs.readFile(EPISODES_JSON_PATH, 'utf-8');
    episodes = JSON.parse(episodesJson);
    console.log(`📋 Found ${episodes.length} episode(s) to transcribe`);
  } catch (error) {
    console.error('❌ Failed to read episodes metadata:', error);
    console.error(`   Expected file at: ${EPISODES_JSON_PATH}`);
    process.exit(1);
  }

  if (episodes.length === 0) {
    console.log('⏭️  No episodes to transcribe');
    process.exit(0);
  }

  // Sort by timestamp (most recent first) and limit to 1 episode
  episodes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const MAX_EPISODES = 1;
  const episodesToProcess = episodes.slice(0, MAX_EPISODES);
  if (episodes.length > MAX_EPISODES) {
    console.log(`⚠️  Limiting to ${MAX_EPISODES} episode per run (most recent first) (${episodes.length} total found)`);
  }

  console.log(`📝 Transcribing most recent episode: ${episodesToProcess[0].title}`);

  // Create transcripts directory
  await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
  console.log(`📁 Transcripts directory: ${TRANSCRIPTS_DIR}`);

  // Create temp directory for audio files
  const tempDir = path.resolve('.temp-audio-transcription');
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`📁 Temp directory: ${tempDir}`);

  // Transcribe episodes
  const results: TranscriptionResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  let transcribedCount = 0;

  // Check for existing transcripts to avoid duplicate work
  for (const episode of episodesToProcess) {
    // Stop after transcribing MAX_EPISODES episodes
    if (transcribedCount >= MAX_EPISODES) {
      console.log(`\n⏹️  Reached limit of ${MAX_EPISODES} episode(s) transcribed`);
      break;
    }

    const safeTitle = sanitizeFilename(episode.title);
    const timestamp = episode.timestamp || Date.now();
    const transcriptFilename = `${safeTitle}-${timestamp}.srt`;
    const transcriptPath = path.join(TRANSCRIPTS_DIR, transcriptFilename);

    // Check if transcript already exists
    try {
      await fs.access(transcriptPath);
      console.log(`⏭️  Skipping existing transcript: ${transcriptFilename}`);
      const transcriptUrl = `${BASE_URL}/transcripts/${transcriptFilename}`;
      results.push({
        dTag: episode.dTag,
        transcriptPath,
        transcriptUrl,
        success: true,
        event: episode.event, // Include original event to avoid re-fetching
      });
      successCount++;
      skippedCount++;
      continue;
    } catch {
      // File doesn't exist, proceed with transcription
    }

    const result = await transcribeEpisode(episode, tempDir);
    results.push(result);

    if (result.success) {
      successCount++;
      transcribedCount++;
    } else {
      failureCount++;
    }
  }

  // Cleanup temp directory
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up temp directory');
  } catch (error) {
    console.warn('⚠️  Failed to cleanup temp directory:', error);
  }

  // Save transcript mapping
  await fs.writeFile(TRANSCRIPT_MAPPING_PATH, JSON.stringify(results, null, 2));
  console.log(`💾 Transcript mapping saved to: ${TRANSCRIPT_MAPPING_PATH}`);

  // Log summary
  console.log('\n📊 Transcription Summary:');
  console.log(`  Total episodes: ${episodes.length}`);
  console.log(`  Successful: ${successCount} (${skippedCount} already transcribed)`);
  console.log(`  Failed: ${failureCount}`);

  if (failureCount > 0) {
    console.log('\n❌ Failed transcriptions:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.dTag}: ${r.error}`);
      });
  }

  // Exit with error code if any transcriptions failed
  if (failureCount > 0) {
    console.log('\n⚠️  Some transcriptions failed. Check logs for details.');
    process.exit(1);
  }

  console.log('\n✅ All transcriptions completed successfully!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

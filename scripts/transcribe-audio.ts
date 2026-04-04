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
import { exec } from 'child_process';
import { EpisodeMetadata } from './lib/conversion-types';
import type { NostrEvent } from '@nostrify/nostrify';

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
 * Download file from URL
 */
async function downloadFile(url: string, filepath: string): Promise<void> {
  console.log(`📥 Downloading: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(filepath, Buffer.from(buffer));

  console.log(`✅ Downloaded to: ${filepath}`);
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
 * Run OpenAI Whisper API transcription
 */
async function runWhisperX(audioPath: string, outputPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const testMode = process.env.TEST_MODE === 'true';

  // Extract short segment for testing
  let audioToTranscribe = audioPath;
  if (testMode) {
    const tempDir = path.dirname(audioPath);
    const basename = path.basename(audioPath, path.extname(audioPath));
    const segmentPath = path.join(tempDir, `${basename}_segment.mp3`);

    await extractAudioSegment(audioPath, segmentPath, 120); // Extract first 2 minutes
    audioToTranscribe = segmentPath;
  }

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for transcription');
  }

  console.log(`🎙️  Running OpenAI Whisper on: ${audioToTranscribe}`);
  if (testMode) {
    console.log(`⚡ TEST MODE: Transcribing 2-minute segment`);
  }

  // Read audio file
  const audioFile = await fs.readFile(audioToTranscribe);

  // Create form data
  const formData = new FormData();
  formData.append('file', new Blob([audioFile]), path.basename(audioToTranscribe));
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'en');

  console.log(`🔧 Calling OpenAI Whisper API...`);

  // Call OpenAI API
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ OpenAI API error: ${response.status} ${response.statusText}`);
    console.error(`Error details: ${errorText}`);
    throw new Error(`OpenAI API failed: ${response.status} ${response.statusText}`);
  }

  const transcription = await response.json();
  console.log(`✅ Transcription completed`);

  // Generate WebVTT format
  const webVTT = generateWebVTT(transcription, testMode);

  // Write WebVTT file
  await fs.writeFile(outputPath, webVTT, 'utf-8');
  console.log(`✅ WebVTT transcript saved to: ${outputPath}`);

  // Clean up segment file if it exists
  if (testMode && audioToTranscribe !== audioPath) {
    fs.unlink(audioToTranscribe).catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Generate WebVTT format from OpenAI Whisper response
 */
interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  segments?: WhisperSegment[];
}

function generateWebVTT(transcription: WhisperResponse, testMode: boolean): string {
  let vtt = 'WEBVTT\n\n';

  if (testMode) {
    vtt += 'NOTE TEST MODE TRANSCRIPT - First 2 minutes only\n\n';
  }

  // Convert segments to WebVTT format
  if (transcription.segments && Array.isArray(transcription.segments)) {
    transcription.segments.forEach((segment: WhisperSegment, index: number) => {
      const startTime = formatTimestamp(segment.start);
      const endTime = formatTimestamp(segment.end);
      const text = segment.text.trim();

      vtt += `${index + 1}\n${startTime} --> ${endTime}\n${text}\n\n`;
    });
  }

  return vtt;
}

/**
 * Format timestamp for WebVTT (HH:MM:SS.mmm)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
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
  const transcriptFilename = `${safeTitle}-${timestamp}.vtt`; // Use .vtt for WebVTT format

  const audioPath = path.join(tempDir, audioFilename);
  const transcriptPath = path.join(TRANSCRIPTS_DIR, transcriptFilename);
  const transcriptUrl = `${BASE_URL}/transcripts/${transcriptFilename}`;

  try {
    // Download audio
    await downloadFile(audioUrl, audioPath);

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
  console.log('🎙️  Starting audio transcription with OpenAI Whisper...');

  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('   Please set OPENAI_API_KEY in your GitHub Actions secrets');
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

  // Limit to first episode for faster processing (diarization takes ~45 min per episode)
  const MAX_EPISODES = 1;
  const episodesToProcess = episodes.slice(0, MAX_EPISODES);
  if (episodes.length > MAX_EPISODES) {
    console.log(`⚠️  Limiting to ${MAX_EPISODES} episode per run for faster processing (${episodes.length} total found)`);
  }

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
    const transcriptFilename = `${safeTitle}-${timestamp}.vtt`; // Use .vtt for WebVTT format
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

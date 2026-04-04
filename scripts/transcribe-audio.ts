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

interface EpisodeMetadata {
  dTag: string;
  title: string;
  audioUrl: string;
  timestamp?: number;
}

interface TranscriptionResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  error?: string;
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
 * Run WhisperX on audio file with diarization
 */
async function runWhisperX(audioPath: string, outputPath: string): Promise<void> {
  const hfToken = process.env.HF_TOKEN;

  if (!hfToken) {
    throw new Error('HF_TOKEN environment variable is required for WhisperX');
  }

  console.log(`🎙️  Running WhisperX on: ${audioPath}`);

  // WhisperX command with diarization (use base model for speed)
  const cmd = `huggingface-cli login --token ${hfToken} && whisperx "${audioPath}" --output_dir "${path.dirname(outputPath)}" --output_format txt --model base --language en --diarize --min_speakers 1 --max_speakers 10`;

  console.log(`🔧 Command: huggingface-cli login --token *** && whisperx "${audioPath}" ...`);

  await new Promise<void>((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ WhisperX error:', stderr);
        reject(new Error(`WhisperX failed: ${error.message}`));
        return;
      }

      console.log('✅ WhisperX output:', stdout);

      // WhisperX creates a .txt file in the output directory
      // The file will have the same name as the input audio file
      const inputBasename = path.basename(audioPath, path.extname(audioPath));
      const txtFile = path.join(path.dirname(outputPath), `${inputBasename}.txt`);

      // Move/rename to the desired output path
      fs.rename(txtFile, outputPath)
        .then(() => {
          console.log(`✅ Transcript saved to: ${outputPath}`);
          resolve();
        })
        .catch(err => {
          console.error('❌ Failed to move transcript:', err);
          reject(err);
        });
    });
  });
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
  const transcriptFilename = `${safeTitle}-${timestamp}.txt`;

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
    const transcriptFilename = `${safeTitle}-${timestamp}.txt`;
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

/**
 * Show notes generation script
 *
 * This script:
 * - Reads transcript mapping from transcription step
 * - Parses SRT files to extract text with speaker labels
 * - Calls HF Inference API to generate summary, topics, and timestamps
 * - Saves show notes to .show-notes-mapping.json
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface TranscriptResult {
  dTag: string;
  transcriptPath: string;
  transcriptUrl: string;
  success: boolean;
  event?: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  };
}

interface ShowNotesResult {
  dTag: string;
  title: string;
  showNotes: string;
  success: boolean;
  error?: string;
}

interface SrtEntry {
  index: number;
  startTime: string;
  endTime: string;
  speaker?: string;
  text: string;
}

const TRANSCRIPT_MAPPING_PATH = path.resolve('.transcript-mapping.json');
const SHOW_NOTES_MAPPING_PATH = path.resolve('.show-notes-mapping.json');

/**
 * Parse SRT file content into structured entries
 */
function parseSrt(content: string): SrtEntry[] {
  const blocks = content.trim().split(/\n\s*\n/);
  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const textLines = lines.slice(2).join(' ');
    // Check for speaker label like [SPEAKER_00] or <v Speaker 1>
    const speakerMatch = textLines.match(/\[SPEAKER_\d+\]\s*|<v\s+([^>]+)>/);
    const speaker = speakerMatch ? (speakerMatch[1] || speakerMatch[0]).trim() : undefined;
    const text = textLines.replace(/\[SPEAKER_\d+\]\s*/g, '').replace(/<v\s+[^>]+>/g, '').trim();

    if (!text) continue;

    entries.push({
      index,
      startTime: timeMatch[1],
      endTime: timeMatch[2],
      speaker,
      text,
    });
  }

  return entries;
}

/**
 * Convert SRT timestamp to readable format
 */
function formatTimestamp(srtTime: string): string {
  const parts = srtTime.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = Math.floor(parseFloat(parts[2]));

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Convert SRT timestamp to seconds
 */
function toSeconds(srtTime: string): number {
  const parts = srtTime.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2].replace(',', '.'));
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extract plain text from SRT entries with timestamps for section breaks
 */
function extractTextWithTimestamps(entries: SrtEntry[]): { text: string; sections: { time: string; text: string }[] } {
  const sections: { time: string; text: string }[] = [];
  let currentSection = '';
  let sectionStart = '';
  const SECTION_BREAK_SECONDS = 300; // 5 minutes

  for (const entry of entries) {
    const seconds = toSeconds(entry.startTime);
    const label = entry.speaker ? `[${entry.speaker}] ` : '';

    if (!sectionStart || seconds - toSeconds(sectionStart) >= SECTION_BREAK_SECONDS) {
      if (currentSection.trim()) {
        sections.push({ time: formatTimestamp(sectionStart), text: currentSection.trim() });
      }
      sectionStart = entry.startTime;
      currentSection = `${label}${entry.text} `;
    } else {
      currentSection += `${label}${entry.text} `;
    }
  }

  if (currentSection.trim()) {
    sections.push({ time: formatTimestamp(sectionStart), text: currentSection.trim() });
  }

  const fullText = entries.map(e => {
    const label = e.speaker ? `[${e.speaker}] ` : '';
    return `${label}${e.text}`;
  }).join(' ');

  return { text: fullText, sections };
}

/**
 * Strip speaker labels and other diarization artifacts from text
 */
function cleanTextForSummarization(text: string): string {
  return text
    .replace(/\[SPEAKER_\d+\]\s*/g, '')
    .replace(/<v\s+[^>]+>\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Call HF Inference API with facebook/bart-large-cnn for summarization
 */
async function summarizeWithBart(text: string, maxRetries: number = 3): Promise<string> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error('HF_TOKEN is required');

  const url = 'https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn';

  // BART-large-CNN max input is ~1024 tokens; limit input text for safety
  const inputText = text.slice(0, 3000);
  console.log(`📏 BART input: ${inputText.length} chars (from ${text.length} total)`);
  console.log(`📄 Input text:\n${inputText}\n---END INPUT---`);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: inputText,
        parameters: {
          max_length: 150,
          min_length: 30,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Model is loading, retry after waiting
      if (response.status === 503) {
        let waitTime = 30;
        try {
          const errorJson = JSON.parse(errorText);
          waitTime = errorJson.estimated_time || 30;
        } catch { /* use default */ }
        console.log(`  ⏳ Model loading, waiting ${Math.min(waitTime, 60)}s...`);
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime * 1000, 60000)));
        continue;
      }

      throw new Error(`HF API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as Array<{ summary_text: string }>;

    if (Array.isArray(result) && result[0]?.summary_text) {
      return result[0].summary_text;
    }

    throw new Error('Unexpected HF API response format');
  }

  throw new Error('Max retries exceeded for HF API');
}

/**
 * Generate show notes from transcript text using BART-large-CNN summarization
 */
async function generateShowNotes(fullText: string, sections: { time: string; text: string }[]): Promise<string> {
  const cleanFullText = cleanTextForSummarization(fullText);
  console.log(`📝 Generating show notes from ${cleanFullText.length} chars of cleaned text...`);

  // Dump cleaned text for debugging
  const debugPath = path.resolve('.show-notes-input.txt');
  await fs.writeFile(debugPath, cleanFullText);
  console.log(`💾 Cleaned transcript dumped to: ${debugPath}`);

  // Summarize the full transcript (or as much as fits in BART's context window)
  try {
    const summary = await summarizeWithBart(cleanFullText);
    console.log(`  ✅ Generated summary`);
    return summary;
  } catch (error) {
    console.warn(`  ⚠️  Summarization failed: ${error instanceof Error ? error.message : error}`);
    // Fallback: use first 500 chars of cleaned text
    return cleanFullText.slice(0, 500) + '...';
  }
}

/**
 * Main function
 */
async function main() {
  console.log('📝 Starting show notes generation...');

  if (!process.env.HF_TOKEN) {
    console.error('❌ HF_TOKEN environment variable is required');
    process.exit(1);
  }

  // Read transcript mapping
  let transcriptResults: TranscriptResult[];
  try {
    const content = await fs.readFile(TRANSCRIPT_MAPPING_PATH, 'utf-8');
    transcriptResults = JSON.parse(content);
    console.log(`📋 Found ${transcriptResults.length} transcript(s)`);
  } catch (error) {
    console.error('❌ Failed to read transcript mapping:', error);
    process.exit(1);
  }

  const successfulTranscripts = transcriptResults.filter(r => r.success);
  if (successfulTranscripts.length === 0) {
    console.log('⏭️  No successful transcriptions to generate show notes for');
    process.exit(0);
  }

  // Limit to 1 episode (most recent)
  const toProcess = successfulTranscripts.slice(0, 1);
  console.log(`📝 Generating show notes for ${toProcess.length} episode(s)`);

  const results: ShowNotesResult[] = [];

  for (const transcript of toProcess) {
    const title = transcript.event?.tags.find(t => t[0] === 'title')?.[1] || 'Unknown Episode';
    console.log(`\n📝 Processing: ${title} (${transcript.dTag})`);

    try {
      // Read SRT file
      const srtContent = await fs.readFile(transcript.transcriptPath, 'utf-8');
      const entries = parseSrt(srtContent);
      console.log(`  📊 Parsed ${entries.length} SRT entries`);

      if (entries.length === 0) {
        throw new Error('No SRT entries found');
      }

      // Extract text and timestamps
      const { text, sections } = extractTextWithTimestamps(entries);
      console.log(`  📊 Extracted ${sections.length} sections from ${text.length} chars`);

      // Generate show notes
      const showNotes = await generateShowNotes(text, sections);

      results.push({
        dTag: transcript.dTag,
        title,
        showNotes,
        success: true,
      });

      console.log(`  ✅ Show notes generated (${showNotes.length} chars)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ❌ Failed: ${errorMessage}`);
      results.push({
        dTag: transcript.dTag,
        title,
        showNotes: '',
        success: false,
        error: errorMessage,
      });
    }
  }

  // Save mapping
  await fs.writeFile(SHOW_NOTES_MAPPING_PATH, JSON.stringify(results, null, 2));
  console.log(`\n💾 Show notes mapping saved to: ${SHOW_NOTES_MAPPING_PATH}`);

  // Summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);

  if (failCount > 0) {
    console.log('\n⚠️  Some show notes generation failed. Check logs.');
    process.exit(1);
  }

  console.log('\n✅ All show notes generated successfully!');
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

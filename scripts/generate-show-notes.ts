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
  summaries: Record<string, { text: string; wordCount: number; charCount: number }>;
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
    // Check for speaker label like [SPEAKER_00]: or <v Speaker 1>
    const speakerMatch = textLines.match(/\[SPEAKER_\d+\]|<v\s+([^>]+)>/);
    const speaker = speakerMatch ? (speakerMatch[1] || speakerMatch[0]).trim() : undefined;
    const text = textLines.replace(/\[SPEAKER_\d+\]:?\s*/g, '').replace(/<v\s+[^>]+>:?\s*/g, '').trim();

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
    const label = entry.speaker ? `${entry.speaker} ` : '';

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
    .replace(/\[SPEAKER_\d+\]:?\s*/g, '')
    .replace(/<v\s+[^>]+>:?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Call HF Inference API with facebook/bart-large-cnn for summarization
 */
async function summarizeWithBart(text: string, maxLength: number, minLength: number, maxRetries: number = 3): Promise<string> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error('HF_TOKEN is required');

  const url = 'https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          max_length: maxLength,
          min_length: minLength,
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
 * Produces multiple summaries at different lengths for comparison
 */
async function generateShowNotes(fullText: string, sections: { time: string; text: string }[]): Promise<{ best: string; summaries: Record<string, { text: string; wordCount: number; charCount: number }> }> {
  const cleanFullText = cleanTextForSummarization(fullText);
  const wordCount = cleanFullText.split(/\s+/).length;
  // Rough token estimate: ~1.3 tokens per word for English
  const estimatedInputTokens = Math.round(wordCount * 1.3);

  console.log(`📝 Generating show notes from ${cleanFullText.length} chars (~${wordCount} words, ~${estimatedInputTokens} tokens)...`);

  // Dump cleaned text for debugging
  const debugPath = path.resolve('.show-notes-input.txt');
  await fs.writeFile(debugPath, cleanFullText);
  console.log(`💾 Cleaned transcript dumped to: ${debugPath}`);

  // Define summary configurations
  const summaryConfigs: Record<string, { maxTokens: number; minTokens: number; label: string }> = {};

  // Word-count based: ~1.3 tokens per word
  summaryConfigs['500words'] = { maxTokens: 700, minTokens: 400, label: '500 words' };
  summaryConfigs['1000words'] = { maxTokens: 1400, minTokens: 800, label: '1000 words' };
  summaryConfigs['1500words'] = { maxTokens: 2000, minTokens: 1200, label: '1500 words' };

  // Percentage based: output tokens = estimated input tokens * percentage
  summaryConfigs['10pct'] = { maxTokens: Math.round(estimatedInputTokens * 0.10), minTokens: Math.round(estimatedInputTokens * 0.05), label: '10%' };
  summaryConfigs['20pct'] = { maxTokens: Math.round(estimatedInputTokens * 0.20), minTokens: Math.round(estimatedInputTokens * 0.10), label: '20%' };
  summaryConfigs['30pct'] = { maxTokens: Math.round(estimatedInputTokens * 0.30), minTokens: Math.round(estimatedInputTokens * 0.15), label: '30%' };

  const summaries: Record<string, { text: string; wordCount: number; charCount: number }> = {};

  for (const [key, config] of Object.entries(summaryConfigs)) {
    console.log(`\n  📊 Generating ${config.label} summary (max_tokens: ${config.maxTokens}, min_tokens: ${config.minTokens})...`);
    try {
      const summary = await summarizeWithBart(cleanFullText, config.maxTokens, config.minTokens);
      const summaryWords = summary.split(/\s+/).length;
      summaries[key] = { text: summary, wordCount: summaryWords, charCount: summary.length };
      console.log(`  ✅ ${config.label}: ${summaryWords} words, ${summary.length} chars`);
      console.log(`  📄 ${config.label} summary:\n${summary}\n---END ${config.label.toUpperCase()}---`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️  ${config.label} failed: ${msg}`);
      summaries[key] = { text: `[FAILED: ${msg}]`, wordCount: 0, charCount: 0 };
    }
  }

  // Use 20% summary as default "best" for RSS feed
  const best = summaries['20pct']?.text || summaries['500words']?.text || cleanFullText.slice(0, 500) + '...';
  return { best, summaries };
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
      const { best, summaries } = await generateShowNotes(text, sections);

      results.push({
        dTag: transcript.dTag,
        title,
        showNotes: best,
        summaries,
        success: true,
      });

      console.log(`  ✅ Best summary (${best.split(/\s+/).length} words, ${best.length} chars)`);
      console.log(`\n  📊 Summary comparison:`);
      for (const [key, s] of Object.entries(summaries)) {
        console.log(`    ${key}: ${s.wordCount} words, ${s.charCount} chars`);
      }
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

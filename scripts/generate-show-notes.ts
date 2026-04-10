/**
 * Show notes generation script
 *
 * This script:
 * - Reads transcript mapping from transcription step
 * - Parses SRT files to extract text with speaker labels
 * - Calls HF Inference API (BART-large-CNN) with chunked summarization
 * - Generates multiple summaries at different lengths for comparison
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

// BART-large-CNN max input is ~1024 tokens (~3000 chars for English)
const BART_MAX_INPUT_CHARS = 3000;

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
    // Strip speaker labels like [SPEAKER_00]: and <v Speaker 1>
    const text = textLines.replace(/\[SPEAKER_\d+\]:?\s*/g, '').replace(/<v\s+[^>]+>:?\s*/g, '').trim();

    if (!text) continue;

    entries.push({
      index,
      startTime: timeMatch[1],
      endTime: timeMatch[2],
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
 * Extract plain text from SRT entries (no speaker labels)
 */
function extractCleanText(entries: SrtEntry[]): { text: string; sections: { time: string; text: string }[] } {
  const sections: { time: string; text: string }[] = [];
  let currentSection = '';
  let sectionStart = '';
  const SECTION_BREAK_SECONDS = 300; // 5 minutes

  for (const entry of entries) {
    const seconds = toSeconds(entry.startTime);

    if (!sectionStart || seconds - toSeconds(sectionStart) >= SECTION_BREAK_SECONDS) {
      if (currentSection.trim()) {
        sections.push({ time: formatTimestamp(sectionStart), text: currentSection.trim() });
      }
      sectionStart = entry.startTime;
      currentSection = `${entry.text} `;
    } else {
      currentSection += `${entry.text} `;
    }
  }

  if (currentSection.trim()) {
    sections.push({ time: formatTimestamp(sectionStart), text: currentSection.trim() });
  }

  // Clean text: join all entry text, collapse whitespace
  const text = entries.map(e => e.text).join(' ').replace(/\s+/g, ' ').trim();

  return { text, sections };
}

/**
 * Split text into chunks that fit within BART's input limit
 */
function chunkText(text: string, maxChars: number = BART_MAX_INPUT_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  // Split on sentence boundaries to avoid cutting mid-sentence
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Call HF Inference API with facebook/bart-large-cnn for summarization
 */
async function summarizeWithBart(text: string, maxLength: number, minLength: number, maxRetries: number = 3): Promise<string> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error('HF_TOKEN is required');

  const url = 'https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn';

  // Ensure input doesn't exceed BART's limit
  const inputText = text.length > BART_MAX_INPUT_CHARS ? text.slice(0, BART_MAX_INPUT_CHARS) : text;

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
 * Chunked summarization: split text, summarize each chunk, combine results
 */
async function chunkedSummarize(text: string, perChunkMaxTokens: number, perChunkMinTokens: number): Promise<string> {
  const chunks = chunkText(text);
  console.log(`  📦 Split into ${chunks.length} chunks (per-chunk: max ${perChunkMaxTokens}, min ${perChunkMinTokens} tokens)`);

  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  📦 Summarizing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const summary = await summarizeWithBart(chunks[i], perChunkMaxTokens, perChunkMinTokens);
    chunkSummaries.push(summary);
  }

  const combined = chunkSummaries.join(' ');

  // If combined result fits in BART's input, do a final coherence pass
  if (combined.length <= BART_MAX_INPUT_CHARS) {
    console.log(`  🔄 Final coherence pass (${combined.length} chars)...`);
    const final = await summarizeWithBart(combined, perChunkMaxTokens, perChunkMinTokens);
    return final;
  }

  // Otherwise just return the concatenated chunk summaries
  console.log(`  📄 Combined ${chunkSummaries.length} chunk summaries (${combined.length} chars)`);
  return combined;
}

/**
 * Generate show notes from transcript text using BART-large-CNN summarization
 * Produces multiple summaries at different lengths for comparison
 */
async function generateShowNotes(cleanText: string, sections: { time: string; text: string }[]): Promise<{ best: string; summaries: Record<string, { text: string; wordCount: number; charCount: number }> }> {
  const wordCount = cleanText.split(/\s+/).length;
  // Rough token estimate: ~1.3 tokens per word for English
  const estimatedInputTokens = Math.round(wordCount * 1.3);
  const numChunks = Math.ceil(cleanText.length / BART_MAX_INPUT_CHARS);

  console.log(`📝 Generating show notes from ${cleanText.length} chars (~${wordCount} words, ~${estimatedInputTokens} tokens, ~${numChunks} chunks)...`);

  // Log full cleaned text
  console.log(`📄 Full cleaned transcript:\n${cleanText}\n---END TRANSCRIPT---`);

  // Define summary configurations
  // For chunked summarization, per-chunk max = target_total_tokens / num_chunks
  const summaryConfigs: Record<string, { perChunkMax: number; perChunkMin: number; label: string }> = {};

  // Word-count based targets (~1.3 tokens per word)
  summaryConfigs['500words'] = { perChunkMax: Math.round(700 / numChunks), perChunkMin: Math.round(400 / numChunks), label: '500 words' };
  summaryConfigs['1000words'] = { perChunkMax: Math.round(1400 / numChunks), perChunkMin: Math.round(800 / numChunks), label: '1000 words' };
  summaryConfigs['1500words'] = { perChunkMax: Math.round(2000 / numChunks), perChunkMin: Math.round(1200 / numChunks), label: '1500 words' };

  // Percentage based: output tokens = estimated input tokens * percentage
  summaryConfigs['10pct'] = { perChunkMax: Math.round(estimatedInputTokens * 0.10 / numChunks), perChunkMin: Math.round(estimatedInputTokens * 0.05 / numChunks), label: '10%' };
  summaryConfigs['20pct'] = { perChunkMax: Math.round(estimatedInputTokens * 0.20 / numChunks), perChunkMin: Math.round(estimatedInputTokens * 0.10 / numChunks), label: '20%' };
  summaryConfigs['30pct'] = { perChunkMax: Math.round(estimatedInputTokens * 0.30 / numChunks), perChunkMin: Math.round(estimatedInputTokens * 0.15 / numChunks), label: '30%' };

  const summaries: Record<string, { text: string; wordCount: number; charCount: number }> = {};

  for (const [key, config] of Object.entries(summaryConfigs)) {
    // Ensure minimums are sane
    const maxTokens = Math.max(config.perChunkMax, 30);
    const minTokens = Math.max(config.perChunkMin, 10);
    console.log(`\n  📊 Generating ${config.label} summary (per-chunk: max ${maxTokens}, min ${minTokens} tokens)...`);
    try {
      const summary = await chunkedSummarize(cleanText, maxTokens, minTokens);
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
  const best = summaries['20pct']?.text || summaries['500words']?.text || '';
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
  let hadFailure = false;

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

      // Extract clean text (no speaker labels)
      const { text, sections } = extractCleanText(entries);
      console.log(`  📊 Extracted ${sections.length} sections from ${text.length} chars`);

      // Generate show notes
      const { best, summaries } = await generateShowNotes(text, sections);

      // Check if all summaries failed
      const allFailed = Object.values(summaries).every(s => s.text.startsWith('[FAILED:'));
      if (allFailed) {
        throw new Error('All summarization attempts failed');
      }

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
        console.log(`    ${key}: ${s.wordCount} words, ${s.charCount} chars${s.text.startsWith('[FAILED:') ? ' ❌' : ''}`);
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
      hadFailure = true;
    }
  }

  // Save mapping
  await fs.writeFile(SHOW_NOTES_MAPPING_PATH, JSON.stringify(results, null, 2));
  console.log(`\n💾 Show notes mapping saved to: ${SHOW_NOTES_MAPPING_PATH}`);

  // Summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);

  if (hadFailure) {
    console.log('\n❌ Show notes generation failed.');
    process.exit(1);
  }

  console.log('\n✅ All show notes generated successfully!');
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

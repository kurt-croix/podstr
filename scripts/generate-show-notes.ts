/**
 * Show notes generation script
 *
 * This script:
 * - Reads transcript mapping from transcription step
 * - Parses SRT files to extract text with speaker labels
 * - Calls z.ai API to generate a summary at ~20% of transcript length
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
  shortSummary: string;
  success: boolean;
  error?: string;
}

interface SrtEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

const TRANSCRIPT_MAPPING_PATH = path.resolve('.transcript-mapping.json');
const SHOW_NOTES_MAPPING_PATH = path.resolve('.show-notes-mapping.json');
const ZHIPU_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const ZHIPU_MODEL = 'glm-5.1';

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
 * Extract plain text from SRT entries and break into timestamped sections
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

  const text = entries.map(e => e.text).join(' ').replace(/\s+/g, ' ').trim();

  return { text, sections };
}

/**
 * Call z.ai chat completions API
 */
async function summarizeWithGLM(transcript: string, targetWordCount: number): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('ZHIPU_API_KEY is required');

  const systemPrompt = `You are a professional podcast show notes writer. You write clear, informative summaries of government meeting recordings. Focus on key decisions, discussions, votes, and action items. Write in a neutral, informative tone. Do not invent information that is not in the transcript.`;

  const userPrompt = `Summarize the following government meeting transcript in approximately ${targetWordCount} words. Cover the main topics discussed, key decisions made, and any notable points raised.

TRANSCRIPT:
${transcript}`;

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en',
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4095,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zhipu API error (${response.status}): ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  if (result.choices?.[0]?.message?.content) {
    const usage = result.usage;
    console.log(`    tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total`);
    return result.choices[0].message.content;
  }

  throw new Error('Unexpected Zhipu API response format');
}

/**
 * Generate show notes: long form (~20%) and short form (~100 words)
 */
async function generateShowNotes(cleanText: string): Promise<{ showNotes: string; shortSummary: string }> {
  const wordCount = cleanText.split(/\s+/).length;
  const targetWords = Math.round(wordCount * 0.20);

  console.log(`📝 Generating show notes from ${cleanText.length} chars (~${wordCount} words), target ~${targetWords} words...`);
  console.log(`📄 Full cleaned transcript:\n${cleanText}\n---END TRANSCRIPT---`);

  // Long summary for <description>
  const showNotes = await summarizeWithGLM(cleanText, targetWords);
  const longWords = showNotes.split(/\s+/).length;
  console.log(`  ✅ Long summary: ${longWords} words, ${showNotes.length} chars`);

  // Short summary for <itunes:summary> (~100 words)
  const shortSummary = await summarizeWithGLM(cleanText, 100);
  const shortWords = shortSummary.split(/\s+/).length;
  console.log(`  ✅ Short summary: ${shortWords} words, ${shortSummary.length} chars`);

  return { showNotes, shortSummary };
}

/**
 * Main function
 */
async function main() {
  console.log('📝 Starting show notes generation...');

  if (!process.env.ZHIPU_API_KEY) {
    console.error('❌ ZHIPU_API_KEY environment variable is required');
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
      const { text } = extractCleanText(entries);
      console.log(`  📊 Extracted ${text.length} chars`);

      // Generate show notes
      const { showNotes, shortSummary } = await generateShowNotes(text);

      results.push({
        dTag: transcript.dTag,
        title,
        showNotes,
        shortSummary,
        success: true,
      });

      console.log(`  ✅ Long: ${showNotes.split(/\s+/).length} words | Short: ${shortSummary.split(/\s+/).length} words`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`  ❌ Failed: ${errorMessage}`);
      results.push({
        dTag: transcript.dTag,
        title,
        showNotes: '',
        shortSummary: '',
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

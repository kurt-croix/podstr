import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'child_process';
import { nip19 } from 'nostr-tools';
import { NSecSigner } from '@nostrify/nostrify';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { NSyteBunkerSigner } from './nsyte-bunker-minimal';
import type { NostrEvent } from '@nostrify/nostrify';
import { getPublicKey } from 'nostr-tools';

/**
 * Strip Hugging Face access tokens and other bearer tokens from a URL.
 * Removes `token=...`, `hf_token=...` query params and any `hf_...` literals.
 * Prevents credential leakage into Nostr events and committed JSON artifacts.
 */
export function redactUrlSecrets(url: string): string {
  try {
    const parsed = new URL(url);
    // Drop known token-bearing params from any host.
    for (const key of ['token', 'hf_token', 'access_token', 'jwt']) {
      parsed.searchParams.delete(key);
    }
    let cleaned = parsed.toString();
    // Final sweep for any inline hf_ literals (defensive).
    cleaned = cleaned.replace(/hf_[A-Za-z0-9]{20,}/g, '[REDACTED]');
    return cleaned;
  } catch {
    // Not a parseable URL — scrub token-like literals anyway.
    return url.replace(/hf_[A-Za-z0-9]{20,}/g, '[REDACTED]');
  }
}

/**
 * Recursively redact Hugging Face token literals from any string in a Nostr event
 * (tags, content). Used before serializing events to disk to satisfy GitHub
 * push protection and avoid leaking credentials to Nostr relays.
 */
export function redactEventSecrets<T extends NostrEvent>(event: T): T {
  const scrub = (s: string) => s.replace(/hf_[A-Za-z0-9]{20,}/g, '[REDACTED]');
  return {
    ...event,
    content: scrub(event.content),
    tags: event.tags.map((tag) =>
      tag.map((value) => (typeof value === 'string' ? scrub(redactUrlSecrets(value)) : value)),
    ),
  };
}

export function extractRecordingUrl(livestream: NostrEvent): string | null {
  const download = livestream.tags.find(([name]) => name === 'download')?.[1];
  if (download) {
    const safe = redactUrlSecrets(download);
    if (safe !== download) {
      console.warn('🔐 Stripped credentials from download URL before publishing');
    }
    console.log('✅ Found download tag (Shoshou recording):', safe);
    return safe;
  }

  const recording = livestream.tags.find(([name]) => name === 'recording')?.[1];
  if (recording) {
    const safe = redactUrlSecrets(recording);
    if (safe !== recording) {
      console.warn('🔐 Stripped credentials from recording URL before publishing');
    }
    console.log('✅ Found recording tag:', safe);
    return safe;
  }

  const streaming = livestream.tags.find(([name]) => name === 'streaming')?.[1];
  if (streaming) {
    const safe = redactUrlSecrets(streaming);
    if (safe !== streaming) {
      console.warn('🔐 Stripped credentials from streaming URL before publishing');
    }
    console.warn('⚠️  Using streaming URL instead of recording (quality may be poor):', safe);
    return safe;
  }

  console.error('❌ No download, recording, or streaming URL found');
  return null;
}

export function shouldSkipLivestream(livestream: NostrEvent): { skip: boolean, reason?: string } {
  const status = livestream.tags.find(([name]) => name === 'status')?.[1];

  if (status === 'cancelled') {
    const dTag = livestream.tags.find(([name]) => name === 'd')?.[1];
    console.log(`⏭️  Skipping cancelled livestream: ${dTag}`);
    return { skip: true, reason: 'Stream was cancelled' };
  }

  const starts = livestream.tags.find(([name]) => name === 'starts')?.[1];
  if (status === 'planned' && starts && parseInt(starts) > Date.now() / 1000) {
    const dTag = livestream.tags.find(([name]) => name === 'd')?.[1];
    console.log(`⏭️  Skipping future livestream: ${dTag}`);
    return { skip: true, reason: 'Stream is scheduled for future' };
  }

  return { skip: false };
}

export function isLivestreamConverted(livestream: NostrEvent, existingEpisodes: NostrEvent[]): boolean {
  const dTag = livestream.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) return false;

  return existingEpisodes.some(ep => {
    const livestreamTag = ep.tags.find(([name]) => name === 'livestream');
    if (!livestreamTag) return false;

    return livestreamTag[1] === `30311:${livestream.pubkey}:${dTag}`;
  });
}

/**
 * Check if a livestream was already processed according to local state.
 * This is faster and more reliable than relay queries for dedup.
 */
export function isLivestreamInState(
  livestream: NostrEvent,
  processedLivestreams: Record<string, { status: string }>,
): boolean {
  const dTag = livestream.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) return false;

  const key = `${livestream.pubkey}:${dTag}`;
  const entry = processedLivestreams[key];
  return !!entry && entry.status === 'success';
}

export function groupLivestreamsForBatch(livestreams: NostrEvent[]): Record<string, NostrEvent[]> {
  const byHour: Record<string, NostrEvent[]> = {};

  livestreams.forEach(stream => {
    // Get starts timestamp from livestream, fallback to created_at
    const starts = stream.tags.find(([name]) => name === 'starts')?.[1];
    const timestamp = starts ? parseInt(starts) : stream.created_at;
    const date = new Date(timestamp * 1000);

    // Group by year-month-day-hour
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;

    if (!byHour[hourKey]) {
      byHour[hourKey] = [];
    }
    byHour[hourKey].push(stream);
  });

  return byHour;
}

export async function combineAudioFiles(audioUrls: string[], outputFilename: string): Promise<string> {
  console.log(`🎵 Combining ${audioUrls.length} audio files...`);

  // Create temp directory
  const tempDir = path.join(process.cwd(), '.temp-audio');
  await fs.mkdir(tempDir, { recursive: true });

  // Download audio files
  const audioFiles: string[] = [];
  for (let i = 0; i < audioUrls.length; i++) {
    const url = audioUrls[i];
    const filename = `audio-${i}.mp3`;
    const filepath = path.join(tempDir, filename);

    console.log(`📥 Downloading: ${url}`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText} (${response.status})`);
      }

      const buffer = await response.arrayBuffer();
      await fs.writeFile(filepath, Buffer.from(buffer));
      audioFiles.push(filepath);
      console.log(`✅ Downloaded: ${filepath}`);
    } catch (error) {
      console.error(`❌ Failed to download audio from ${url}:`, error);
      throw error;
    }
  }

  // Create input list file for ffmpeg
  const listFilePath = path.join(tempDir, 'concat-list.txt');
  const listContent = audioFiles.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(listFilePath, listContent);

  // Combine audio using ffmpeg
  const outputPath = path.join(tempDir, outputFilename);
  const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}"`;

  console.log(`🎬 Running ffmpeg...`);
  await new Promise<void>((resolve, reject) => {
    exec(ffmpegCmd, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ FFmpeg error:', stderr);
        reject(error);
      } else {
        console.log('✅ FFmpeg output:', stdout.trim());
        resolve();
      }
    });
  });

  console.log(`✅ Combined audio saved to: ${outputPath}`);

  return outputPath;
}

export async function uploadCombinedAudio(filepath: string, privateKey: string | undefined, nbunksec?: string): Promise<string> {
  console.log('☁️  Uploading combined audio to Blossom...');

  // Read file
  const fileBuffer = await fs.readFile(filepath);
  const file = new File([fileBuffer], path.basename(filepath), {
    type: 'audio/mpeg'
  });

  // Create signer
  let signer;
  if (nbunksec) {
    console.log('🔐 Using nsyte bunker for remote signing');
    const [bunkerUrl, _rest] = nbunksec.split('?');
    signer = new NSyteBunkerSigner(bunkerUrl, nbunksec);
  } else {
    if (!privateKey) {
      throw new Error('Private key is required when not using nbunksec');
    }
    console.log('🔐 Using local NSecSigner');
    signer = new NSecSigner(privateKey);
  }

  // Upload to Blossom
  const uploader = new BlossomUploader({
    servers: [
      'https://nostr.download',
      'https://blossom.band'
    ],
    signer,
    expiresIn: 1_800_000, // 30 minutes
  });

  try {
    const tags = await uploader.upload(file);
    const [[_, url]] = tags; // First tag is URL

    console.log(`✅ Upload successful: ${url}`);

    // Cleanup temp files
    await fs.rm(path.dirname(filepath), { recursive: true, force: true });
    console.log('🧹 Cleaned up temp audio files');

    return url;
  } catch (error) {
    console.error('❌ Blossom upload failed:', error);
    throw new Error(`Blossom upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function createSigner(privateKey: string | undefined, nbunksec?: string) {
  if (nbunksec) {
    console.log('🔐 Using nsyte bunker for remote signing');
    const [bunkerUrl, _rest] = nbunksec.split('?');
    return {
      signer: new NSyteBunkerSigner(bunkerUrl, nbunksec),
      pubkey: '', // Will be filled by the bunker on connection
    };
  }
  if (!privateKey) {
    throw new Error('Private key is required when not using nbunksec');
  }

  // Convert nsec (bech32) to hex if needed
  let hexPrivateKey = privateKey;
  if (privateKey.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(privateKey);
      if (decoded.type === 'nsec') {
        hexPrivateKey = decoded.data as string;
        console.log('🔑 Converted nsec to hex format');
      } else {
        throw new Error('Invalid nsec format');
      }
    } catch (error) {
      console.warn('⚠️  Failed to decode nsec, assuming hex format:', error);
    }
  }

  console.log('🔐 Using local NSecSigner');
  const pubkey = getPublicKey(hexPrivateKey);
  return {
    signer: new NSecSigner(hexPrivateKey),
    pubkey,
  };
}

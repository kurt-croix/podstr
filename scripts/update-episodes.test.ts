import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateEpisodeWithTranscript, publishEvent, publishToRelay } from './update-episodes-with-transcripts';
import type { NostrEvent } from '@nostrify/nostrify';

// Build a mock WebSocket constructor that stores instances
const mockInstances: Array<{ on: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];

vi.mock('ws', () => {
  return {
    __esModule: true,
    default: vi.fn(function(this: unknown, _url: string) {
      const instance = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
      };
      Object.assign(this, instance);
      mockInstances.push(instance);
    }),
    WebSocket: vi.fn(function(this: unknown, _url: string) {
      const instance = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
      };
      Object.assign(this, instance);
      mockInstances.push(instance);
    }),
  };
});

// Generate a test nsec key pair
function generateTestKey() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = i + 1;
  return { hex: Buffer.from(bytes).toString('hex'), bytes };
}

function makeMockEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 100,
    kind: 30054,
    tags: [
      ['d', 'test-episode-123'],
      ['title', 'Test Episode'],
      ['audio', 'https://example.com/audio.mp3', 'audio/mpeg'],
    ],
    content: '',
    sig: 'c'.repeat(128),
    ...overrides,
  };
}

describe('updateEpisodeWithTranscript', () => {
  const { hex } = generateTestKey();

  it('adds transcript tag when none exists', async () => {
    const event = makeMockEvent();
    const url = 'https://example.com/transcript.srt';

    const updated = await updateEpisodeWithTranscript(event, url, hex);

    const transcriptTag = updated.tags.find(([name]) => name === 'transcript');
    expect(transcriptTag).toBeDefined();
    expect(transcriptTag![1]).toBe(url);
  });

  it('replaces existing transcript tag', async () => {
    const event = makeMockEvent({
      tags: [
        ['d', 'test-episode-123'],
        ['transcript', 'https://old-url.com/transcript.srt'],
      ],
    });
    const newUrl = 'https://new-url.com/transcript.srt';

    const updated = await updateEpisodeWithTranscript(event, newUrl, hex);

    const transcriptTags = updated.tags.filter(([name]) => name === 'transcript');
    expect(transcriptTags.length).toBe(1);
    expect(transcriptTags[0][1]).toBe(newUrl);
  });

  it('preserves other tags', async () => {
    const event = makeMockEvent({
      tags: [
        ['d', 'test-episode-123'],
        ['title', 'Test Episode'],
        ['audio', 'https://example.com/audio.mp3'],
      ],
    });

    const updated = await updateEpisodeWithTranscript(event, 'https://example.com/t.srt', hex);

    expect(updated.tags.find(([n]) => n === 'd')![1]).toBe('test-episode-123');
    expect(updated.tags.find(([n]) => n === 'title')![1]).toBe('Test Episode');
    expect(updated.tags.find(([n]) => n === 'audio')![1]).toBe('https://example.com/audio.mp3');
  });

  it('produces a valid signed event with different id', async () => {
    const event = makeMockEvent();
    const updated = await updateEpisodeWithTranscript(event, 'https://example.com/t.srt', hex);

    expect(updated.id).not.toBe(event.id);
    expect(updated.sig).toBeDefined();
    expect(updated.sig.length).toBeGreaterThan(0);
    expect(updated.kind).toBe(event.kind);
    expect(updated.created_at).toBeGreaterThanOrEqual(event.created_at);
  });
});

describe('publishToRelay', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  it('returns true when relay accepts', async () => {
    const event = makeMockEvent();
    const promise = publishToRelay(event, 'wss://fake.relay');

    // Wait for the constructor to create the instance
    await new Promise(r => setTimeout(r, 10));
    const ws = mockInstances[0];
    expect(ws).toBeDefined();

    // Trigger open then message
    const openHandler = ws.on.mock.calls.find(([e]) => e === 'open')![1];
    const messageHandler = ws.on.mock.calls.find(([e]) => e === 'message')![1];
    await openHandler();
    expect(ws.send).toHaveBeenCalled();
    messageHandler(Buffer.from(JSON.stringify(['OK', event.id, true, ''])));

    const result = await promise;
    expect(result).toBe(true);
  });

  it('returns false when relay rejects', async () => {
    const event = makeMockEvent();
    const promise = publishToRelay(event, 'wss://fake.relay');

    await new Promise(r => setTimeout(r, 10));
    const ws = mockInstances[0];
    const openHandler = ws.on.mock.calls.find(([e]) => e === 'open')![1];
    const messageHandler = ws.on.mock.calls.find(([e]) => e === 'message')![1];
    await openHandler();
    messageHandler(Buffer.from(JSON.stringify(['OK', event.id, false, 'rejected'])));

    const result = await promise;
    expect(result).toBe(false);
  });

  it('returns false on connection error', async () => {
    const event = makeMockEvent();
    const promise = publishToRelay(event, 'wss://fake.relay');

    await new Promise(r => setTimeout(r, 10));
    const ws = mockInstances[0];
    const errorHandler = ws.on.mock.calls.find(([e]) => e === 'error')![1];
    errorHandler(new Error('connection failed'));

    const result = await promise;
    expect(result).toBe(false);
  });
});

describe('publishEvent', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  it('returns true when first relay accepts', async () => {
    const event = makeMockEvent();
    const promise = publishEvent(event);

    await new Promise(r => setTimeout(r, 10));
    const ws = mockInstances[0];
    const messageHandler = ws.on.mock.calls.find(([e]) => e === 'message')![1];
    messageHandler(Buffer.from(JSON.stringify(['OK', event.id, true, ''])));

    const result = await promise;
    expect(result).toBe(true);
  });

  it('tries next relay when first rejects', async () => {
    const event = makeMockEvent();
    const promise = publishEvent(event);

    await new Promise(r => setTimeout(r, 10));
    // First relay rejects
    const ws1 = mockInstances[0];
    const msgHandler1 = ws1.on.mock.calls.find(([e]) => e === 'message')![1];
    msgHandler1(Buffer.from(JSON.stringify(['OK', event.id, false, 'rejected'])));

    // Wait for second relay attempt
    await new Promise(r => setTimeout(r, 50));
    const ws2 = mockInstances[1];
    if (ws2) {
      const msgHandler2 = ws2.on.mock.calls.find(([e]) => e === 'message')![1];
      msgHandler2(Buffer.from(JSON.stringify(['OK', event.id, true, ''])));
    }

    const result = await promise;
    expect(result).toBe(true);
  });
});

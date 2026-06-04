import type { DeckPreviewEvent } from '@agentra/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeStreamEvent } from '../lib/bedrock-agent.js';
import { chatStreamEventSchema } from '../lib/chat-stream.js';

// Mock the runtime so we can drive a deterministic event sequence through the
// real /chat SSE handler (verifies the Epic #403 deck_progress relay end-to-end
// at the BFF boundary, independent of AWS).
const deckEvents: DeckPreviewEvent[] = [
  { type: 'deck_preview_started', deckId: 'deck-1', name: 'Demo', totalSlides: 2 },
  {
    type: 'deck_slide_compose_ready',
    deckId: 'deck-1',
    slug: 'cover',
    index: 1,
    totalSlides: 2,
    composeUrl: 'https://example.com/cover.json?sig',
    defsUrl: 'https://example.com/defs.json?sig',
    previewUrl: null,
  },
  { type: 'deck_preview_completed', deckId: 'deck-1', totalSlides: 2 },
];

vi.mock('../lib/bedrock-agent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/bedrock-agent.js')>();
  return {
    ...actual,
    invokeAgentStream: async function* (): AsyncGenerator<RuntimeStreamEvent> {
      yield { type: 'text', text: 'スライドを作成しました。' };
      for (const event of deckEvents) {
        yield { type: 'deck_progress', event };
      }
      yield { type: 'done' };
    },
  };
});

function parseSseBody(body: string) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown)
    .map((raw) => {
      const result = chatStreamEventSchema.safeParse(raw);
      if (!result.success) throw new Error(`Invalid event: ${result.error}`);
      return result.data;
    });
}

describe('POST /chat - deck_progress relay (Epic #403)', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
  });

  it('relays each deck_progress event over the SSE stream, ordered, before done', async () => {
    const { app } = await import('../app.js');
    const response = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'スライドを作って' }),
    });

    expect(response.status).toBe(200);
    const events = parseSseBody(await response.text());

    const deckProgress = events.filter((e) => e.type === 'deck_progress');
    expect(deckProgress).toHaveLength(3);
    expect(
      deckProgress.map((e) => (e as { event: { type: string } }).event.type),
    ).toEqual([
      'deck_preview_started',
      'deck_slide_compose_ready',
      'deck_preview_completed',
    ]);

    // deck_progress must precede the terminal done event.
    const lastDeckIdx = events.map((e) => e.type).lastIndexOf('deck_progress');
    const doneIdx = events.map((e) => e.type).indexOf('done');
    expect(doneIdx).toBeGreaterThan(lastDeckIdx);
  });
});

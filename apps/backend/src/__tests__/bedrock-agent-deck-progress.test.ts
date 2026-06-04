import { describe, expect, it } from 'vitest';
import { parseWrappedRuntimeEvent } from '../lib/bedrock-agent.js';

/**
 * The router (agentcore-runtime-ts) emits deck progress wrapped in the AgentCore
 * SSE envelope: `{ event: 'message', data: { type: 'deck_progress', event } }`.
 * The BFF unwraps one envelope layer, then maps `deck_progress` to a runtime event.
 */
function envelope(payload: unknown): string {
  return JSON.stringify({ event: 'message', data: payload });
}

describe('parseWrappedRuntimeEvent — deck_progress', () => {
  it('parses a started event', () => {
    const parsed = parseWrappedRuntimeEvent(
      envelope({
        type: 'deck_progress',
        event: {
          type: 'deck_preview_started',
          deckId: 'd1',
          name: 'Demo',
          totalSlides: 2,
        },
      }),
    );
    expect(parsed).toEqual({
      type: 'deck_progress',
      event: { type: 'deck_preview_started', deckId: 'd1', name: 'Demo', totalSlides: 2 },
    });
  });

  it('parses a slide compose_ready event with presigned URLs', () => {
    const event = {
      type: 'deck_slide_compose_ready',
      deckId: 'd1',
      slug: 'cover',
      index: 1,
      totalSlides: 2,
      composeUrl: 'https://example.com/cover.json?sig',
      defsUrl: 'https://example.com/defs.json?sig',
      previewUrl: null,
    };
    const parsed = parseWrappedRuntimeEvent(envelope({ type: 'deck_progress', event }));
    expect(parsed).toEqual({ type: 'deck_progress', event });
  });

  it('drops a malformed deck_progress payload (degrade, no crash)', () => {
    const parsed = parseWrappedRuntimeEvent(
      envelope({ type: 'deck_progress', event: { type: 'deck_bogus', deckId: 'd1' } }),
    );
    expect(parsed).toBeUndefined();
  });

  it('drops deck_progress with a missing inner event', () => {
    const parsed = parseWrappedRuntimeEvent(envelope({ type: 'deck_progress' }));
    expect(parsed).toBeUndefined();
  });

  it('still parses non-deck events (regression: envelope key collision)', () => {
    // deck_progress payloads themselves carry an `event` key; ensure the single
    // envelope unwrap does not mis-handle ordinary text events.
    const parsed = parseWrappedRuntimeEvent(envelope({ type: 'text', text: 'hi' }));
    expect(parsed).toEqual({ type: 'text', text: 'hi' });
  });

  it('parses a deck_progress payload emitted WITHOUT the envelope wrapper', () => {
    // Live regression: the deck_progress payload's own `event` key (an object)
    // must not be mistaken for the AgentCore envelope tag (a string). When the
    // runtime emits the bare payload, the unwrap must leave it intact.
    const event = {
      type: 'deck_slide_compose_ready',
      deckId: 'd1',
      slug: 'cover',
      index: 1,
      totalSlides: 3,
      composeUrl: 'https://example.com/cover.json?sig',
      defsUrl: 'https://example.com/defs.json?sig',
      previewUrl: null,
    };
    const bare = JSON.stringify({ type: 'deck_progress', event });
    expect(parseWrappedRuntimeEvent(bare)).toEqual({ type: 'deck_progress', event });
  });
});

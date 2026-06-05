import { describe, expect, it } from 'vitest';
import { createSlideSseParser } from '../slide-sse-parser.js';

const deckFrame = (event: object) =>
  `event: message\ndata: ${JSON.stringify({ event: 'message', data: { type: 'deck_progress', event } })}\n\n`;

const resultFrame = (result: object) =>
  `data: ${JSON.stringify({ type: 'result', result })}\n\n`;

describe('createSlideSseParser', () => {
  it('decodes deck_progress and result frames in order', () => {
    const p = createSlideSseParser();
    const msgs = [
      ...p.push(deckFrame({ type: 'deck_preview_started', deckId: 'd1' })),
      ...p.push(deckFrame({ type: 'deck_slide_compose_ready', index: 1 })),
      ...p.push(resultFrame({ success: true })),
    ];
    expect(msgs.map((m) => m.kind)).toEqual(['deck_progress', 'deck_progress', 'result']);
    expect(
      msgs[0]?.kind === 'deck_progress' && (msgs[0].event as { type: string }).type,
    ).toBe('deck_preview_started');
    expect(
      msgs[2]?.kind === 'result' && (msgs[2].result as { success: boolean }).success,
    ).toBe(true);
  });

  it('reassembles a frame split across chunk boundaries', () => {
    const p = createSlideSseParser();
    const full = deckFrame({ type: 'deck_preview_started', deckId: 'd1' });
    const mid = Math.floor(full.length / 2);
    expect(p.push(full.slice(0, mid))).toEqual([]);
    const msgs = p.push(full.slice(mid));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.kind).toBe('deck_progress');
  });

  it('handles multiple frames arriving in one chunk', () => {
    const p = createSlideSseParser();
    const chunk =
      deckFrame({ type: 'deck_preview_started', deckId: 'd1' }) +
      deckFrame({ type: 'deck_preview_completed', deckId: 'd1', totalSlides: 1 });
    expect(p.push(chunk).map((m) => m.kind)).toEqual(['deck_progress', 'deck_progress']);
  });

  it('tolerates CRLF frame separators', () => {
    const p = createSlideSseParser();
    const frame = `data: ${JSON.stringify({ type: 'result', result: { success: true } })}\r\n\r\n`;
    expect(p.push(frame).map((m) => m.kind)).toEqual(['result']);
  });

  it('skips comment lines and non-JSON frames', () => {
    const p = createSlideSseParser();
    expect(p.push(': keep-alive\n\n')).toEqual([]);
    expect(p.push('data: not json\n\n')).toEqual([]);
  });

  it('flush() emits a trailing frame not terminated by a blank line', () => {
    const p = createSlideSseParser();
    expect(
      p.push(`data: ${JSON.stringify({ type: 'result', result: { ok: 1 } })}`),
    ).toEqual([]);
    expect(p.flush().map((m) => m.kind)).toEqual(['result']);
  });

  it('accepts a bare (un-enveloped) data payload', () => {
    const p = createSlideSseParser();
    const frame = `data: ${JSON.stringify({ type: 'deck_progress', event: { type: 'x' } })}\n\n`;
    expect(p.push(frame).map((m) => m.kind)).toEqual(['deck_progress']);
  });
});

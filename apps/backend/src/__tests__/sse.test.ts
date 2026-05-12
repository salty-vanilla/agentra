import { describe, expect, it } from 'vitest';
import { formatSseComment, formatSseMessage } from '../lib/sse.js';

describe('sse helpers', () => {
  it('formats heartbeat comments as SSE comments', () => {
    expect(formatSseComment('ping')).toBe(': ping\n\n');
    expect(formatSseComment(': ping')).toBe(': ping\n\n');
  });

  it('formats named SSE events with JSON payloads', () => {
    expect(
      formatSseMessage({
        id: '42',
        event: 'token',
        data: { type: 'text', text: 'hello' },
      }),
    ).toBe('id: 42\nevent: token\ndata: {"type":"text","text":"hello"}\n\n');
  });
});

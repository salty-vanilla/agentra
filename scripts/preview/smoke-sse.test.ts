import { describe, expect, test } from 'vitest';
import {
  isSuccessTerminal,
  isTerminalEvent,
  type SseEvent,
  SseParser,
} from './smoke-sse.js';

const SAMPLE_STREAM =
  ': ping\n' +
  'event: thread_started\n' +
  'data: {"threadId":"t-1"}\n' +
  '\n' +
  'event: token\n' +
  'data: {"text":"hello"}\n' +
  '\n' +
  'event: done\n' +
  'data: {"threadId":"t-1"}\n' +
  '\n';

/** Feed a string to a fresh parser split at the given character boundaries. */
function parseSplit(text: string, boundaries: number[]): SseEvent[] {
  const parser = new SseParser();
  const events: SseEvent[] = [];
  let start = 0;
  for (const boundary of [...boundaries, text.length]) {
    events.push(...parser.push(text.slice(start, boundary)));
    start = boundary;
  }
  return events;
}

describe('SseParser', () => {
  test('parses event/data pairs and ignores heartbeat comments', () => {
    const events = new SseParser().push(SAMPLE_STREAM);

    expect(events.map((e) => e.name)).toEqual(['thread_started', 'token', 'done']);
    expect(events[0]?.data).toEqual({ threadId: 't-1' });
    expect(events[1]?.data).toEqual({ text: 'hello' });
  });

  test('defaults to token when no event name precedes the data line', () => {
    const events = new SseParser().push('data: {"text":"hi"}\n');

    expect(events).toEqual([{ name: 'token', data: { text: 'hi' } }]);
  });

  test('survives a split mid event: line', () => {
    // Split inside "event: thread_started"
    const events = parseSplit(SAMPLE_STREAM, [
      SAMPLE_STREAM.indexOf('thread_started') + 4,
    ]);

    expect(events.map((e) => e.name)).toEqual(['thread_started', 'token', 'done']);
  });

  test('survives a split mid data: JSON payload', () => {
    // Split inside the first data JSON object
    const events = parseSplit(SAMPLE_STREAM, [SAMPLE_STREAM.indexOf('"threadId"') + 5]);

    expect(events.map((e) => e.name)).toEqual(['thread_started', 'token', 'done']);
    expect(events[0]?.data).toEqual({ threadId: 't-1' });
  });

  test('byte-by-byte feeding yields identical events to whole-string feeding', () => {
    const whole = new SseParser().push(SAMPLE_STREAM);
    const perChar = parseSplit(
      SAMPLE_STREAM,
      Array.from({ length: SAMPLE_STREAM.length }, (_, i) => i),
    );

    expect(perChar).toEqual(whole);
  });

  test('handles CRLF line endings', () => {
    const crlf = 'event: done\r\ndata: {"ok":true}\r\n\r\n';
    const events = new SseParser().push(crlf);

    expect(events).toEqual([{ name: 'done', data: { ok: true } }]);
  });

  test('retains a partial trailing line until completed by a later push', () => {
    const parser = new SseParser();
    expect(parser.push('event: do')).toEqual([]);
    expect(parser.push('ne\ndata: {"x":1}\n')).toEqual([
      { name: 'done', data: { x: 1 } },
    ]);
  });
});

describe('terminal helpers', () => {
  test('identifies terminal events', () => {
    expect(isTerminalEvent('done')).toBe(true);
    expect(isTerminalEvent('error')).toBe(true);
    expect(isTerminalEvent('cancelled')).toBe(true);
    expect(isTerminalEvent('token')).toBe(false);
  });

  test('only done is a success terminal', () => {
    expect(isSuccessTerminal('done')).toBe(true);
    expect(isSuccessTerminal('error')).toBe(false);
    expect(isSuccessTerminal('cancelled')).toBe(false);
  });
});

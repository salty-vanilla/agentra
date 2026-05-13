import { describe, expect, it } from 'vitest';
import { chatStreamEventSchema } from '../lib/chat-stream.js';

function parseSseDataLines(rawBody: string): unknown[] {
  return rawBody
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function hasTerminalEvent(events: unknown[]): boolean {
  return events.some((raw) => {
    const result = chatStreamEventSchema.safeParse(raw);
    if (!result.success) return false;
    return result.data.type === 'done' || result.data.type === 'error';
  });
}

function hasThreadStartedEvent(events: unknown[]): boolean {
  return events.some((raw) => {
    const result = chatStreamEventSchema.safeParse(raw);
    if (!result.success) return false;
    return result.data.type === 'thread_started';
  });
}

function getThreadStartedId(events: unknown[]): string | undefined {
  for (const raw of events) {
    const result = chatStreamEventSchema.safeParse(raw);
    if (!result.success) continue;
    if (result.data.type === 'thread_started') return result.data.threadId;
  }
  return undefined;
}

describe('SSE premature EOF detection', () => {
  it('detects a complete stream with done event as non-premature', () => {
    const rawBody = [
      'data: {"type":"thread_started","threadId":"t1"}',
      'data: {"type":"text","text":"hello"}',
      'data: {"type":"done","threadId":"t1","model":"m","createdAt":"2026-01-01T00:00:00.000Z"}',
      '',
    ].join('\n');

    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(true);
    expect(hasThreadStartedEvent(events)).toBe(true);
    expect(getThreadStartedId(events)).toBe('t1');
  });

  it('detects a complete stream with error event as non-premature', () => {
    const rawBody = [
      'data: {"type":"thread_started","threadId":"t2"}',
      'data: {"type":"error","threadId":"t2","error":"Agent failed"}',
      '',
    ].join('\n');

    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(true);
    expect(hasThreadStartedEvent(events)).toBe(true);
    expect(getThreadStartedId(events)).toBe('t2');
  });

  it('detects a premature EOF stream (no terminal event)', () => {
    const rawBody = [
      'data: {"type":"thread_started","threadId":"t3"}',
      'data: {"type":"text","text":"partial"}',
      '',
    ].join('\n');

    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(false);
    expect(hasThreadStartedEvent(events)).toBe(true);
    expect(getThreadStartedId(events)).toBe('t3');
  });

  it('detects a first-message failure: thread_started followed by error includes threadId', () => {
    const rawBody = [
      'data: {"type":"thread_started","threadId":"t4"}',
      'data: {"type":"error","threadId":"t4","error":"Agent invocation failed."}',
      '',
    ].join('\n');

    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(true);

    const errorEvent = events.find((raw) => {
      const result = chatStreamEventSchema.safeParse(raw);
      return result.success && result.data.type === 'error';
    });
    const parsed = chatStreamEventSchema.safeParse(errorEvent);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'error') {
      expect(parsed.data.threadId).toBe('t4');
    }
  });

  it('handles an empty stream (no events) as premature EOF', () => {
    const rawBody = '';
    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(false);
    expect(hasThreadStartedEvent(events)).toBe(false);
  });

  it('handles stream with only heartbeat comments as premature EOF', () => {
    const rawBody = [': ping', ': ping', ''].join('\n');
    const events = parseSseDataLines(rawBody);
    expect(hasTerminalEvent(events)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { createEventChannel } from './event-channel.js';

/** Collect everything an async iterable yields, in order. */
async function drain<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe('createEventChannel', () => {
  it('yields pushed items in order, then ends when closed', async () => {
    const ch = createEventChannel<number>();
    ch.push(1);
    ch.push(2);
    ch.close();
    expect(await drain(ch)).toEqual([1, 2]);
  });

  it('delivers items pushed *after* the consumer started waiting', async () => {
    const ch = createEventChannel<string>();
    const collected = drain(ch);
    // Push asynchronously, simulating a producer running concurrently.
    await Promise.resolve();
    ch.push('a');
    await Promise.resolve();
    ch.push('b');
    ch.close();
    expect(await collected).toEqual(['a', 'b']);
  });

  it('ignores pushes after close (no late delivery)', async () => {
    const ch = createEventChannel<number>();
    ch.push(1);
    ch.close();
    ch.push(2);
    expect(await drain(ch)).toEqual([1]);
  });

  it('ends an already-drained iterator without hanging when closed late', async () => {
    const ch = createEventChannel<number>();
    const collected = drain(ch);
    ch.push(7);
    // close after a tick; the consumer must resolve, not hang.
    await Promise.resolve();
    ch.close();
    expect(await collected).toEqual([7]);
  });

  it('supports an empty channel (close with nothing pushed)', async () => {
    const ch = createEventChannel<number>();
    ch.close();
    expect(await drain(ch)).toEqual([]);
  });
});

import type { DeckPreviewEvent } from '@agentra/agent-tools';
import { describe, expect, it } from 'vitest';
import { createDeckMergedStream, type MergedItem } from '../deck-merge.js';

const ev = (deckId: string): DeckPreviewEvent => ({
  type: 'deck_preview_started',
  deckId,
  name: 'n',
});

function arrayStream<V>(items: V[]) {
  let i = 0;
  return {
    next: async (): Promise<
      { value: V; done?: false } | { value: undefined; done: true }
    > =>
      i < items.length ? { value: items[i++] as V } : { value: undefined, done: true },
  };
}

async function drain<V, D>(
  stream: AsyncGenerator<MergedItem<V, D>>,
): Promise<MergedItem<V, D>[]> {
  const out: MergedItem<V, D>[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

describe('createDeckMergedStream', () => {
  it('passes through agent events and ends with agent-done', async () => {
    const { stream } = createDeckMergedStream(arrayStream(['a', 'b']));
    expect(await drain(stream)).toEqual([
      { source: 'agent', value: 'a' },
      { source: 'agent', value: 'b' },
      { source: 'agent-done', value: undefined },
    ]);
  });

  it('yields buffered deck events first, then the agent events', async () => {
    const { sink, stream } = createDeckMergedStream(arrayStream(['a']));
    sink.onDeckEvent(ev('d1'));
    sink.onDeckEvent(ev('d2'));
    const out = await drain(stream);
    expect(out).toEqual([
      { source: 'deck', event: ev('d1') },
      { source: 'deck', event: ev('d2') },
      { source: 'agent', value: 'a' },
      { source: 'agent-done', value: undefined },
    ]);
  });

  it('flushes deck events pushed after the agent stream finished', async () => {
    // Agent stream resolves done immediately; push deck events before draining.
    const { sink, stream } = createDeckMergedStream(arrayStream<string>([]));
    sink.onDeckEvent(ev('late'));
    expect(await drain(stream)).toEqual([
      { source: 'deck', event: ev('late') },
      { source: 'agent-done', value: undefined },
    ]);
  });

  it('delivers a deck event that arrives while waiting on a slow agent event', async () => {
    let releaseAgent: () => void = () => {};
    let firstCall = true;
    const agentStream = {
      next: (): Promise<
        { value: string; done?: false } | { value: undefined; done: true }
      > => {
        if (firstCall) {
          firstCall = false;
          return new Promise((resolve) => {
            releaseAgent = () => resolve({ value: 'a' });
          });
        }
        return Promise.resolve({ value: undefined, done: true });
      },
    };
    const { sink, stream } = createDeckMergedStream(agentStream);
    const it = stream[Symbol.asyncIterator]();

    const firstP = it.next(); // starts racing agentNext vs deck
    await Promise.resolve();
    sink.onDeckEvent(ev('mid')); // deck wins the race
    const first = await firstP;
    expect(first.value).toEqual({ source: 'deck', event: ev('mid') });

    releaseAgent();
    const second = await it.next();
    expect(second.value).toEqual({ source: 'agent', value: 'a' });
    const third = await it.next();
    expect(third.value).toEqual({ source: 'agent-done', value: undefined });
    const fourth = await it.next();
    expect(fourth.done).toBe(true);
  });

  it('does not lose a deck event pushed in the null-resolver window', async () => {
    // Push a deck event before the consumer ever parks (wakeDeck is null): it must
    // still be delivered via the top-of-loop queue re-check, not dropped.
    const { sink, stream } = createDeckMergedStream(arrayStream(['a']));
    const it = stream[Symbol.asyncIterator]();
    sink.onDeckEvent(ev('early')); // wakeDeck === null at this point
    const first = await it.next();
    expect(first.value).toEqual({ source: 'deck', event: ev('early') });
    const second = await it.next();
    expect(second.value).toEqual({ source: 'agent', value: 'a' });
  });
});

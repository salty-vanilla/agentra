import type { DeckPreviewEvent } from '@agentra/agent-tools';
import { type DeckRelaySink, runWithDeckRelay } from './deck-relay.js';

/**
 * Merge the router's agent event stream with the real-time deck events pushed by
 * the slide tool (Epic #421). Without this, deck events pushed *during* a blocking
 * `create_slide_presentation` tool call would queue up and only flush after the
 * tool's `toolResult` surfaces on the agent stream — i.e. no real-time reveal.
 *
 * The merge races `agentStream.next()` against the next buffered deck event and
 * yields whichever is ready, tagged by source. When the agent stream finishes it
 * drains any remaining buffered deck events, then ends — so no late event is lost.
 */
export type MergedItem<V, D = V> =
  | { source: 'agent'; value: V }
  | { source: 'deck'; event: DeckPreviewEvent }
  | { source: 'agent-done'; value: D };

interface AgentStreamLike<V, D> {
  next: () => Promise<IteratorResult<V, D>>;
}

export interface DeckMergedStream<V, D = V> {
  /** Sink the slide tool forwards deck events into (via the ALS relay). */
  sink: DeckRelaySink;
  /** Tagged merge of agent events + deck events; ends when the agent stream does. */
  stream: AsyncGenerator<MergedItem<V, D>>;
}

export function createDeckMergedStream<V, D = V>(
  agentStream: AgentStreamLike<V, D>,
  options: { relay?: boolean } = {},
): DeckMergedStream<V, D> {
  // When the relay is off, the agent `next()` runs without a relay context, so
  // the slide tool sees no active relay and stays non-streaming — the merge then
  // just forwards agent events (deck queue stays empty). Default off keeps the
  // pre-#421 behavior unchanged.
  const relayEnabled = options.relay === true;
  // Bounded in practice by O(deck slides) — deck preview emits started + one
  // event per slide + completed (single digits). This is NOT a general-purpose
  // unbounded relay; do not route high-frequency events through this sink.
  const deckQueue: DeckPreviewEvent[] = [];
  let wakeDeck: (() => void) | null = null;

  const sink: DeckRelaySink = {
    onDeckEvent(event: DeckPreviewEvent): void {
      deckQueue.push(event);
      if (wakeDeck) {
        const w = wakeDeck;
        wakeDeck = null;
        w();
      }
    },
  };

  // Each agent `next()` runs inside the relay context so the slide tool callback
  // (which executes during the awaited tool call) can forward events to `sink`.
  const nextAgent = relayEnabled
    ? () => runWithDeckRelay(sink, () => agentStream.next())
    : () => agentStream.next();

  async function* stream(): AsyncGenerator<MergedItem<V, D>> {
    let agentNext = nextAgent();
    let doneValue: D | undefined;

    while (true) {
      if (deckQueue.length > 0) {
        yield { source: 'deck', event: deckQueue.shift() as DeckPreviewEvent };
        continue;
      }
      // Race the next agent event against a deck-event arrival.
      const deckArrival = new Promise<'deck'>((resolve) => {
        wakeDeck = () => resolve('deck');
      });
      const winner = await Promise.race([
        agentNext.then((r) => ({ kind: 'agent' as const, r })),
        deckArrival.then(() => ({ kind: 'deck' as const })),
      ]);
      // Stop waking via this resolver regardless of who won.
      wakeDeck = null;

      if (winner.kind === 'deck') {
        continue; // loop re-checks deckQueue and yields the buffered event
      }
      if (winner.r.done) {
        doneValue = winner.r.value;
        break;
      }
      yield { source: 'agent', value: winner.r.value };
      agentNext = nextAgent();
    }

    // Agent finished: the tool call (and its deck pushes) are complete, so flush
    // whatever deck events remain buffered, then surface the final agent value
    // (carries metrics) so the caller can finalize.
    while (deckQueue.length > 0) {
      yield { source: 'deck', event: deckQueue.shift() as DeckPreviewEvent };
    }
    yield { source: 'agent-done', value: doneValue as D };
  }

  return { sink, stream: stream() };
}

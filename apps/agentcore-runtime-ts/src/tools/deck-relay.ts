import { AsyncLocalStorage } from 'node:async_hooks';
import type { DeckPreviewEvent } from '@agentra/agent-tools';

/**
 * Per-invocation deck-event relay (Epic #421).
 *
 * The router consumes the slide-runtime's real-time SSE inside the
 * `create_slide_presentation` tool callback, but it needs those events to reach
 * the router's *outer* streaming generator so they can be relayed to the client
 * as `deck_progress`. The tool callback and the generator are decoupled (Strands
 * tools are request/response), so we pass the sink implicitly via AsyncLocalStorage:
 * the generator runs the agent loop inside {@link runWithDeckRelay}, and the tool
 * forwards each event through {@link emitDeckRelayEvent}.
 */
export interface DeckRelaySink {
  onDeckEvent: (event: DeckPreviewEvent) => void;
}

const storage = new AsyncLocalStorage<DeckRelaySink>();

/** Run `fn` with `sink` active for any nested {@link emitDeckRelayEvent} call. */
export function runWithDeckRelay<T>(
  sink: DeckRelaySink,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(sink, fn);
}

/** Forward a deck event to the active relay sink, if any. Never throws. */
export function emitDeckRelayEvent(event: DeckPreviewEvent): void {
  const sink = storage.getStore();
  if (!sink) return;
  try {
    sink.onDeckEvent(event);
  } catch {
    // a throwing sink must never break slide generation
  }
}

/** True when a relay sink is active (i.e. the router wants real-time events). */
export function isDeckRelayActive(): boolean {
  return storage.getStore() !== undefined;
}

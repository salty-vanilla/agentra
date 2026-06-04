/**
 * A minimal single-producer / single-consumer async channel (Epic #417/#420).
 *
 * The streaming slide-runtime handler needs to yield deck-progress events *as
 * they happen* while `executeCreatePresentationTool` runs to completion. The
 * tool surfaces events through a synchronous `onDeckEvent` callback, but the
 * handler is an async generator — this channel bridges the two: the tool
 * `push`es events from its callback, the generator drains them with `for await`,
 * and `close()` ends the stream once the tool resolves.
 *
 * Backpressure is intentionally unbounded: deck events are few and small, and
 * dropping/blocking them would defeat the live-preview purpose. Pushes after
 * `close()` are ignored so a late callback can never resurrect a finished stream.
 */
export interface EventChannel<T> extends AsyncIterable<T> {
  /** Enqueue an item for the consumer. No-op after {@link close}. */
  push(item: T): void;
  /** Signal end-of-stream; the consumer's `for await` loop completes. */
  close(): void;
}

export function createEventChannel<T>(): EventChannel<T> {
  const queue: T[] = [];
  let closed = false;
  let consuming = false;
  // Set when the consumer is parked waiting for the next item; calling it wakes
  // the consumer so it re-checks the queue / closed flag.
  let wake: (() => void) | null = null;

  const signal = (): void => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  return {
    push(item: T): void {
      if (closed) return;
      queue.push(item);
      signal();
    },
    close(): void {
      if (closed) return;
      closed = true;
      signal();
    },
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      // Single-consumer: a second concurrent iterator would overwrite `wake` and
      // silently hang the first. Fail loudly instead of hanging.
      if (consuming) {
        throw new Error('EventChannel supports a single concurrent consumer');
      }
      consuming = true;
      try {
        while (true) {
          if (queue.length > 0) {
            yield queue.shift() as T;
            continue;
          }
          if (closed) return;
          // Park until a push or close wakes us. `wake` is assigned synchronously
          // here (the executor runs sync), so no push/close can be lost between
          // the `closed` check and suspension.
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        consuming = false;
      }
    },
  };
}

const textEncoder = new TextEncoder();

export type SseMessage = {
  event?: string;
  data?: unknown;
  id?: string;
  retry?: number;
};

export type SseStream = {
  writeEvent: (message: SseMessage) => Promise<void>;
  writeComment: (comment: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  onAbort: (handler: () => void) => void;
  close: () => void;
  readonly aborted: boolean;
};

export function createSseHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
}

export function formatSseComment(comment: string): string {
  const normalized = comment.startsWith(':') ? comment.slice(1).trimStart() : comment;
  return `: ${normalized}\n\n`;
}

export function formatSseMessage(message: SseMessage): string {
  const lines: string[] = [];

  if (message.id) {
    lines.push(`id: ${message.id}`);
  }
  if (message.event) {
    lines.push(`event: ${message.event}`);
  }
  if (typeof message.retry === 'number' && Number.isFinite(message.retry)) {
    lines.push(`retry: ${Math.max(0, Math.trunc(message.retry))}`);
  }

  const data =
    typeof message.data === 'string' ? message.data : JSON.stringify(message.data ?? '');
  for (const line of data.split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function createAbortableSleep(signal: AbortSignal, ms: number): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      resolve();
    };

    function cleanup() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createSseResponse(
  signal: AbortSignal,
  handler: (stream: SseStream) => Promise<void>,
): Response {
  if (signal.aborted) {
    return new Response(null, { headers: createSseHeaders() });
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const abortHandlers = new Set<() => void>();
        let writeChain = Promise.resolve();

        const enqueue = (chunk: string) => {
          writeChain = writeChain.then(async () => {
            if (closed) {
              return;
            }

            controller.enqueue(textEncoder.encode(chunk));
          });

          return writeChain;
        };

        const close = () => {
          if (closed) {
            return;
          }

          closed = true;
          abortHandlers.clear();
          signal.removeEventListener('abort', handleAbort);
          controller.close();
        };

        const handleAbort = () => {
          if (closed) {
            return;
          }

          for (const abortHandler of abortHandlers) {
            try {
              abortHandler();
            } catch (error) {
              console.error('SSE abort handler failed:', error);
            }
          }

          close();
        };

        const stream: SseStream = {
          writeEvent: async (message) => enqueue(formatSseMessage(message)),
          writeComment: async (comment) => enqueue(formatSseComment(comment)),
          sleep: (ms) => createAbortableSleep(signal, ms),
          onAbort: (handlerFn) => {
            abortHandlers.add(handlerFn);
          },
          close,
          get aborted() {
            return signal.aborted || closed;
          },
        };

        signal.addEventListener('abort', handleAbort, { once: true });

        void (async () => {
          try {
            await handler(stream);
          } catch (error) {
            if (!signal.aborted) {
              console.error('SSE stream handler failed:', error);
            }
          } finally {
            close();
          }
        })();
      },
    }),
    { headers: createSseHeaders() },
  );
}

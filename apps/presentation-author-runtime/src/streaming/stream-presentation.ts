import type { CreatePresentationToolOutput } from '@agentra/presentation-author';
import type { DeckPreviewEvent } from '@agentra/shared';
import { createEventChannel } from './event-channel.js';

export interface StreamPresentationRequest {
  prompt: string;
  language?: 'ja' | 'en' | undefined;
  traceId?: string | undefined;
  diagnostics?: boolean | undefined;
  revision?: boolean | undefined;
}

/** Runs the presentation tool, forwarding deck events through `onDeckEvent`. */
export type RunPresentationTool = (
  request: StreamPresentationRequest,
  opts: { onDeckEvent: (event: DeckPreviewEvent) => void },
) => Promise<CreatePresentationToolOutput>;

/** A wrapped runtime SSE message (matches the router's `{ event, data }` shape). */
export type RuntimeStreamMessage =
  | { event: 'message'; data: { type: 'deck_progress'; event: DeckPreviewEvent } }
  | { event: 'message'; data: { type: 'result'; result: CreatePresentationToolOutput } };

function failureResult(reason: string): CreatePresentationToolOutput {
  return {
    success: false,
    summary:
      'Presentation creation failed during an unknown error. No PPTX artifact was produced.',
    workDir: '',
    artifacts: [],
    warnings: [],
    error: { message: reason, phase: 'unknown' },
  };
}

/**
 * Stream a presentation build (Epic #417/#420): yield each deck-progress event
 * in real time as the tool produces it, then a final `result` message.
 *
 * The tool runs concurrently and pushes deck events through a channel; the
 * generator drains them, then awaits the tool and emits its result. Never
 * throws — a tool rejection becomes a `success: false` result message so the
 * stream always terminates cleanly with exactly one `result`.
 */
export async function* streamPresentation(
  request: StreamPresentationRequest,
  deps: { runTool: RunPresentationTool },
): AsyncGenerator<RuntimeStreamMessage> {
  const channel = createEventChannel<DeckPreviewEvent>();

  // Resolves to a discriminated outcome and NEVER rejects, so the tool promise
  // can never surface as an unhandled rejection even if the consumer abandons
  // this generator early (client disconnect). The tool itself has no cancel
  // path, so an abandoned run keeps going until it finishes — a known limitation.
  const settled = deps
    .runTool(request, { onDeckEvent: (event) => channel.push(event) })
    .then((result) => ({ ok: result }) as const)
    .catch(
      (err: unknown) =>
        ({ err: err instanceof Error ? err.message : String(err) }) as const,
    )
    .finally(() => channel.close());

  for await (const event of channel) {
    yield { event: 'message', data: { type: 'deck_progress', event } };
  }

  const outcome = await settled;
  const finalResult = 'ok' in outcome ? outcome.ok : failureResult(outcome.err);
  yield { event: 'message', data: { type: 'result', result: finalResult } };
}

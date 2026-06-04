/**
 * Tolerant SSE frame parser for the slide-runtime streaming response (Epic #421).
 *
 * The streaming slide-runtime (BedrockAgentCoreApp async-generator, #420) emits
 * `{ event: 'message', data: {...} }` messages serialized as Server-Sent Events.
 * We can't assume the exact framing the SDK uses, so this parser is deliberately
 * lenient: it accumulates a buffer, splits on blank-line frame boundaries, and
 * for each frame pulls the JSON out of its `data:` line(s) (falling back to the
 * whole frame if there is no `data:` prefix). Non-JSON frames are skipped.
 */

export interface SlideStreamDeckMessage {
  kind: 'deck_progress';
  /** The inner DeckPreviewEvent (validated by the caller). */
  event: unknown;
}

export interface SlideStreamResultMessage {
  kind: 'result';
  result: unknown;
}

export type SlideStreamMessage = SlideStreamDeckMessage | SlideStreamResultMessage;

/** Extract the JSON payload from a single SSE frame's lines. */
function frameToJson(frame: string): unknown {
  const dataLines: string[] = [];
  let sawData = false;
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith(':')) continue; // comment line
    if (line.startsWith('data:')) {
      sawData = true;
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  const text = (sawData ? dataLines.join('\n') : frame).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Map a decoded frame payload to a typed slide-stream message, if recognized. */
function toMessage(payload: unknown): SlideStreamMessage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  // Unwrap the `{ event: 'message', data: {...} }` envelope when present.
  const rec = payload as Record<string, unknown>;
  const inner =
    typeof rec.event === 'string' && 'data' in rec
      ? (rec.data as Record<string, unknown>)
      : rec;
  if (!inner || typeof inner !== 'object') return undefined;
  const type = (inner as { type?: unknown }).type;
  if (type === 'deck_progress' && 'event' in inner) {
    return { kind: 'deck_progress', event: (inner as { event: unknown }).event };
  }
  if (type === 'result' && 'result' in inner) {
    return { kind: 'result', result: (inner as { result: unknown }).result };
  }
  return undefined;
}

/**
 * Stateful SSE frame splitter. Feed it raw chunks; it returns the complete
 * messages decoded so far and keeps any partial trailing frame buffered.
 */
export function createSlideSseParser() {
  let buffer = '';

  return {
    /** Push a raw text chunk; returns any newly completed messages. */
    push(chunk: string): SlideStreamMessage[] {
      buffer += chunk;
      const out: SlideStreamMessage[] = [];
      // Frames are separated by a blank line (\n\n), tolerating \r\n\r\n.
      let sep = findFrameBoundary(buffer);
      while (sep.index !== -1) {
        const frame = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep.length);
        const msg = toMessage(frameToJson(frame));
        if (msg) out.push(msg);
        sep = findFrameBoundary(buffer);
      }
      return out;
    },
    /** Flush any trailing frame that wasn't terminated by a blank line. */
    flush(): SlideStreamMessage[] {
      const text = buffer;
      buffer = '';
      if (!text.trim()) return [];
      const msg = toMessage(frameToJson(text));
      return msg ? [msg] : [];
    },
  };
}

function findFrameBoundary(buffer: string): { index: number; length: number } {
  const rn = buffer.indexOf('\r\n\r\n');
  const nn = buffer.indexOf('\n\n');
  if (rn !== -1 && (nn === -1 || rn < nn)) return { index: rn, length: 4 };
  if (nn !== -1) return { index: nn, length: 2 };
  return { index: -1, length: 0 };
}

/**
 * Stateful Server-Sent-Events parser for the preview chat smoke check.
 *
 * Ported from apps/backend/scripts/smoke-bff.ts but kept pure and decoupled
 * from any stream type so it is unit-testable on plain strings. A `SseParser`
 * instance holds the cross-chunk buffer and current event name, so feeding the
 * stream in arbitrary chunk splits (mid-line, mid-JSON) yields exactly the same
 * events as feeding the whole payload at once. Only complete lines are flushed;
 * a partial trailing line is retained until the next `push`.
 */

export type SseEventName =
  | 'thread_started'
  | 'token'
  | 'status'
  | 'observation'
  | 'progress_summary'
  | 'sub_agent_progress'
  | 'artifact'
  | 'done'
  | 'error'
  | 'cancelled';

export interface SseEvent {
  readonly name: SseEventName;
  readonly data: unknown;
}

const TERMINAL_EVENTS: ReadonlySet<SseEventName> = new Set([
  'done',
  'error',
  'cancelled',
]);

export function isTerminalEvent(name: SseEventName): boolean {
  return TERMINAL_EVENTS.has(name);
}

export function isSuccessTerminal(name: SseEventName): boolean {
  return name === 'done';
}

/**
 * Safe diagnostic fields extracted from a terminal `done` event payload. Only
 * these correlation identifiers are surfaced — never the raw response body,
 * prompt, or any free-text content.
 */
export interface TerminalDiagnostics {
  requestId?: string;
  traceId?: string;
  threadId?: string;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Pull `requestId`, `traceId`, and `threadId` from a terminal event payload.
 *
 * Tolerates payload-shape drift: `traceId` is read either from the top level or
 * from `observabilitySummary.traceId`. Non-object payloads yield an empty object.
 * Deliberately does NOT retain the raw payload — only the three identifiers are
 * returned so callers cannot accidentally persist response content.
 */
export function extractTerminalDiagnostics(data: unknown): TerminalDiagnostics {
  if (data === null || typeof data !== 'object') {
    return {};
  }
  const record = data as Record<string, unknown>;

  let traceId = nonEmptyString(record.traceId);
  if (traceId === undefined) {
    const summary = record.observabilitySummary;
    if (summary !== null && typeof summary === 'object') {
      traceId = nonEmptyString((summary as Record<string, unknown>).traceId);
    }
  }

  const result: TerminalDiagnostics = {};
  const requestId = nonEmptyString(record.requestId);
  const threadId = nonEmptyString(record.threadId);
  if (requestId !== undefined) result.requestId = requestId;
  if (traceId !== undefined) result.traceId = traceId;
  if (threadId !== undefined) result.threadId = threadId;
  return result;
}

/**
 * Incremental SSE parser. Call `push(chunk)` for each decoded text chunk; the
 * returned events are those completed by that chunk. Lines split across chunk
 * boundaries (and event/data names spanning chunks) are handled via the
 * retained buffer and `currentEventName`.
 */
export class SseParser {
  private buffer = '';
  private currentEventName: string | undefined;

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];

    let lineEnd = this.buffer.indexOf('\n');
    while (lineEnd >= 0) {
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, '');
      this.buffer = this.buffer.slice(lineEnd + 1);
      lineEnd = this.buffer.indexOf('\n');

      const event = this.consumeLine(line);
      if (event !== undefined) {
        events.push(event);
      }
    }

    return events;
  }

  private consumeLine(line: string): SseEvent | undefined {
    if (line.startsWith(':')) {
      return undefined; // heartbeat comment
    }

    if (line.startsWith('event:')) {
      this.currentEventName = line.slice(6).trim();
      return undefined;
    }

    if (line.startsWith('data:')) {
      const rawData = line.slice(5).trim();
      if (!rawData || rawData === '[DONE]') {
        this.currentEventName = undefined;
        return undefined;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = rawData;
      }
      const eventName = (this.currentEventName ?? 'token') as SseEventName;
      this.currentEventName = undefined;
      return { name: eventName, data: parsed };
    }

    if (line === '') {
      this.currentEventName = undefined;
    }
    return undefined;
  }
}

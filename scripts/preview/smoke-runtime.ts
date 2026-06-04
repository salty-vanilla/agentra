/**
 * Side-effecting probe implementations for the smoke runtime: real HTTP, real
 * `/chat` SSE consumption, and real AgentCore invocation.
 *
 * Kept thin and deliberately not unit-tested (mirrors cli-runtime.ts); the
 * testable selection/aggregation/parsing logic lives in run-smoke.ts,
 * smoke-checks.ts, smoke-report.ts, and smoke-sse.ts.
 */
import { randomUUID } from 'node:crypto';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import type {
  AgentCoreProbeParams,
  AgentCoreProbeResult,
  HttpProbeResult,
  SseProbeResult,
} from './run-smoke.js';
import {
  extractTerminalDiagnostics,
  isSuccessTerminal,
  isTerminalEvent,
  type SseEventName,
  SseParser,
  type TerminalDiagnostics,
} from './smoke-sse.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function httpProbe(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<HttpProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const latencyMs = Date.now() - start;
    let bodyJson: unknown;
    try {
      bodyJson = await res.json();
    } catch {
      bodyJson = undefined;
    }
    return { status: res.status, latencyMs, bodyJson, timedOut: false };
  } catch (error) {
    const latencyMs = Date.now() - start;
    if (controller.signal.aborted) {
      return { status: 0, latencyMs, timedOut: true };
    }
    return { status: 0, latencyMs, error: errorMessage(error), timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function consumeSse(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<SseProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  const parser = new SseParser();
  const events: SseEventName[] = [];
  let gotTerminal = false;
  let terminalIsSuccess = false;
  let opened = false;
  let diagnostics: TerminalDiagnostics = {};

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status !== 200 || !res.body) {
      return {
        opened: false,
        events,
        gotTerminal,
        terminalIsSuccess,
        latencyMs: Date.now() - start,
        timedOut: false,
        error: `unexpected status ${res.status}`,
      };
    }

    opened = true;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (!gotTerminal) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          events.push(event.name);
          if (isTerminalEvent(event.name)) {
            gotTerminal = true;
            terminalIsSuccess = isSuccessTerminal(event.name);
            // Capture only the safe correlation ids, never the raw payload.
            diagnostics = extractTerminalDiagnostics(event.data);
            break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      opened,
      events,
      gotTerminal,
      terminalIsSuccess,
      latencyMs: Date.now() - start,
      timedOut: false,
      ...diagnostics,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    if (controller.signal.aborted) {
      return {
        opened,
        events,
        gotTerminal,
        terminalIsSuccess,
        latencyMs,
        timedOut: true,
      };
    }
    return {
      opened,
      events,
      gotTerminal,
      terminalIsSuccess,
      latencyMs,
      timedOut: false,
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

interface DrainState {
  sawAny: boolean;
  sawError: boolean;
}

/**
 * Decode an AgentCore stream chunk to text. The SDK's stream may yield strings,
 * `Uint8Array`, `ArrayBuffer`, or other typed-array views depending on runtime;
 * mirrors `decodeChunk` in apps/agentcore-runtime-ts/scripts/smoke-utils.ts so a
 * non-`Uint8Array` chunk does not silently become an empty string.
 */
function decodeChunk(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
  if (chunk instanceof ArrayBuffer)
    return new TextDecoder().decode(new Uint8Array(chunk));
  if (ArrayBuffer.isView(chunk)) {
    return new TextDecoder().decode(
      new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    );
  }
  return String(chunk ?? '');
}

/** A non-empty payload counts as output; a JSON `{ type: "error" }` is a failure. */
function inspectPayload(raw: string, state: DrainState): void {
  const value = raw.trim();
  if (!value || value === '[DONE]') return;
  state.sawAny = true;
  try {
    const parsed = JSON.parse(value) as { type?: unknown } | null;
    if (parsed && typeof parsed === 'object' && parsed.type === 'error') {
      state.sawError = true;
    }
  } catch {
    // Non-JSON text payload still counts as output (sawAny already set).
  }
}

/**
 * Inspect one line of the stream. Handles both `text/event-stream` framing
 * (`event:` / `data:` / `:` comment) and raw JSON-line payloads, so the optional
 * AgentCore check does not produce a false negative when the runtime returns
 * raw JSON instead of SSE.
 */
function processLine(
  line: string,
  state: DrainState,
  ctx: { eventName: string | undefined },
): void {
  const trimmed = line.trim();
  if (trimmed === '') {
    ctx.eventName = undefined;
    return;
  }
  if (trimmed.startsWith(':')) return; // heartbeat comment
  if (trimmed.startsWith('event:')) {
    ctx.eventName = trimmed.slice(6).trim();
    if (ctx.eventName === 'error') state.sawError = true;
    return;
  }
  if (trimmed.startsWith('data:')) {
    inspectPayload(trimmed.slice(5), state);
    ctx.eventName = undefined;
    return;
  }
  // Raw (non-SSE) line, e.g. a bare JSON object.
  inspectPayload(trimmed, state);
}

/** Drain an AgentCore response stream, noting whether any/error events arrived. */
async function drainAgentCore(stream: unknown): Promise<DrainState> {
  const state: DrainState = { sawAny: false, sawError: false };
  const ctx: { eventName: string | undefined } = { eventName: undefined };

  const drainLines = (text: string, buffer: string): string => {
    let working = buffer + text;
    let idx = working.indexOf('\n');
    while (idx >= 0) {
      processLine(working.slice(0, idx).replace(/\r$/, ''), state, ctx);
      working = working.slice(idx + 1);
      idx = working.indexOf('\n');
    }
    return working;
  };

  const asyncIterable = stream as AsyncIterable<unknown> | undefined;
  if (asyncIterable && typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    let buffer = '';
    for await (const chunk of asyncIterable) {
      buffer = drainLines(decodeChunk(chunk), buffer);
    }
    if (buffer.trim()) processLine(buffer, state, ctx);
    return state;
  }

  const streamable = stream as { transformToString?: () => Promise<string> } | undefined;
  if (streamable?.transformToString) {
    const text = await streamable.transformToString();
    const remainder = drainLines(text, '');
    if (remainder.trim()) processLine(remainder, state, ctx);
  }
  return state;
}

export async function invokeAgentCore(
  params: AgentCoreProbeParams,
): Promise<AgentCoreProbeResult> {
  const client = new BedrockAgentCoreClient(
    params.region ? { region: params.region } : {},
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  const start = Date.now();
  const sessionId = `preview-smoke-${randomUUID()}`;
  const payload = {
    prompt: params.prompt,
    model: 'haiku',
    threadId: sessionId,
    traceId: sessionId,
    userId: 'preview-smoke',
  };

  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: params.arn,
      ...(params.qualifier ? { qualifier: params.qualifier } : {}),
      runtimeSessionId: sessionId,
      traceId: sessionId,
      contentType: 'application/json',
      accept: 'text/event-stream',
      payload: new TextEncoder().encode(JSON.stringify(payload)),
    });
    const response = await client.send(command, { abortSignal: controller.signal });
    const latencyMs = Date.now() - start;
    if (!response.response) {
      return { ok: false, latencyMs, error: 'empty AgentCore response', timedOut: false };
    }
    const { sawAny, sawError } = await drainAgentCore(response.response);
    if (sawError) {
      return {
        ok: false,
        latencyMs,
        error: 'AgentCore emitted an error event',
        timedOut: false,
      };
    }
    if (!sawAny) {
      return {
        ok: false,
        latencyMs,
        error: 'no AgentCore output received',
        timedOut: false,
      };
    }
    return { ok: true, latencyMs, timedOut: false };
  } catch (error) {
    const latencyMs = Date.now() - start;
    if (controller.signal.aborted) {
      return {
        ok: false,
        latencyMs,
        timedOut: true,
        error: `timed out after ${params.timeoutMs}ms`,
      };
    }
    return { ok: false, latencyMs, timedOut: false, error: errorMessage(error) };
  } finally {
    clearTimeout(timer);
  }
}

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
  isSuccessTerminal,
  isTerminalEvent,
  type SseEventName,
  SseParser,
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

interface DrainResult {
  sawAny: boolean;
  sawError: boolean;
}

/** Drain an AgentCore response stream, noting whether any/error events arrived. */
async function drainAgentCore(stream: unknown): Promise<DrainResult> {
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let sawAny = false;
  let sawError = false;

  const inspect = (text: string): void => {
    for (const event of parser.push(text)) {
      sawAny = true;
      const data = event.data as { type?: unknown } | null;
      if (event.name === 'error' || data?.type === 'error') {
        sawError = true;
      }
    }
  };

  const asyncIterable = stream as AsyncIterable<Uint8Array> | undefined;
  if (asyncIterable && typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of asyncIterable) {
      inspect(decoder.decode(chunk, { stream: true }));
    }
    return { sawAny, sawError };
  }

  const streamable = stream as { transformToString?: () => Promise<string> } | undefined;
  if (streamable?.transformToString) {
    const text = await streamable.transformToString();
    inspect(text);
    if (!sawAny && text.trim().length > 0) {
      sawAny = true;
    }
  }
  return { sawAny, sawError };
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

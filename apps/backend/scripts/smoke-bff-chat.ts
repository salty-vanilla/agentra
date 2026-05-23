#!/usr/bin/env tsx
/**
 * Live BFF /chat SSE smoke script.
 *
 * Calls the deployed BFF HTTP API (via API Gateway + Lambda Web Adapter) and
 * verifies the SSE stream reaches the Streaming API endpoint. Use this to
 * confirm end-to-end transport before investigating runtime issues.
 *
 * Usage:
 *   # With env file generated from CDK outputs:
 *   just outputs-env <stage> bff-smoke
 *   just smoke-bff-chat <stage> <profile>
 *
 *   # Direct (auth required in production):
 *   AGENTRA_STREAMING_API_BASE_URL=https://... \
 *   AGENTRA_AUTH_TOKEN=<cognito-id-token> \
 *   pnpm --filter @agentra/backend exec tsx scripts/smoke-bff-chat.ts
 *
 * Env vars:
 *   AGENTRA_STREAMING_API_BASE_URL  (required) streaming API base URL
 *   AGENTRA_AUTH_TOKEN              (required for auth-enabled envs)
 *   SMOKE_PROMPT                    (default: built-in greeting)
 *   SMOKE_THREAD_ID                 (optional, reuse an existing thread)
 *   SMOKE_TIMEOUT_MS                (default: 300000)
 *
 * Exit codes:
 *   0 — all required events received and requestId/traceId present
 *   1 — smoke failed (error event, timeout, missing fields, or network error)
 */

import { uuidv7 } from 'uuidv7';

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = '[smoke:bff-chat]';
const DEFAULT_PROMPT = 'こんにちは。一言で自己紹介してください。';
const DEFAULT_TIMEOUT_MS = 300_000;

export type BffSmokeConfig = {
  readonly streamingApiBaseUrl: string;
  readonly authToken: string | undefined;
  readonly prompt: string;
  readonly threadId: string | undefined;
  readonly timeoutMs: number;
};

export type BffSmokeResult = {
  readonly threadId: string;
  readonly requestId: string;
  readonly traceId: string | undefined;
  readonly eventCounts: Record<string, number>;
};

export function readBffSmokeConfig(): BffSmokeConfig {
  const streamingApiBaseUrl = process.env.AGENTRA_STREAMING_API_BASE_URL?.trim();
  if (!streamingApiBaseUrl) {
    throw new Error(
      `${TAG} Missing required env var: AGENTRA_STREAMING_API_BASE_URL\n` +
        `  Run: just outputs-env <stage> bff-smoke  then  just smoke-bff-chat <stage>`,
    );
  }
  return {
    streamingApiBaseUrl,
    authToken: process.env.AGENTRA_AUTH_TOKEN?.trim() || undefined,
    prompt: process.env.SMOKE_PROMPT?.trim() || DEFAULT_PROMPT,
    threadId: process.env.SMOKE_THREAD_ID?.trim() || undefined,
    timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

// ── SSE parsing ───────────────────────────────────────────────────────────────

type ParsedSseEvent = {
  readonly event?: string;
  readonly data: unknown;
};

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          const rawData = line.slice('data:'.length).trim();
          if (rawData) {
            try {
              yield { event: currentEvent, data: JSON.parse(rawData) };
            } catch {
              // skip non-JSON data lines (e.g. heartbeat comments)
            }
          }
          currentEvent = undefined;
        } else if (line === '') {
          currentEvent = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Smoke run ─────────────────────────────────────────────────────────────────

export async function runBffSmoke(config: BffSmokeConfig): Promise<BffSmokeResult> {
  const endpoint = `${config.streamingApiBaseUrl}/chat`;
  const requestBodyId = uuidv7();

  console.log(`${TAG} endpoint=${endpoint}`);
  // Do not log the prompt — it may contain sensitive content in CI/CD contexts.

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'X-Request-ID': requestBodyId,
  };
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  const body: Record<string, unknown> = { message: config.prompt };
  if (config.threadId) {
    body.threadId = config.threadId;
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort(
      new Error(`${TAG} smoke timed out after ${config.timeoutMs}ms`),
    );
  }, config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    throw new Error(
      `${TAG} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    clearTimeout(timeoutHandle);
    const text = await response.text().catch(() => '(unreadable)');
    throw new Error(`${TAG} HTTP ${response.status}: ${text}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    clearTimeout(timeoutHandle);
    throw new Error(
      `${TAG} Unexpected Content-Type: ${contentType} (expected text/event-stream)`,
    );
  }

  if (!response.body) {
    clearTimeout(timeoutHandle);
    throw new Error(`${TAG} Response body is null`);
  }

  const eventCounts: Record<string, number> = {};
  let threadId: string | undefined;
  let requestId: string | undefined;
  let traceId: string | undefined;
  let gotDone = false;
  let gotError = false;

  try {
    for await (const { data } of parseSseStream(response.body, abortController.signal)) {
      if (typeof data !== 'object' || data === null || !('type' in data)) continue;
      const event = data as Record<string, unknown>;
      const type = String(event.type ?? 'unknown');

      eventCounts[type] = (eventCounts[type] ?? 0) + 1;

      if (type === 'thread_started') {
        threadId = String(event.threadId ?? '');
      } else if (type === 'done') {
        requestId = String(event.requestId ?? '');
        threadId = String(event.threadId ?? threadId ?? '');
        const obs = event.observabilitySummary;
        if (obs && typeof obs === 'object' && 'traceId' in obs) {
          traceId = String((obs as Record<string, unknown>).traceId ?? '');
        }
        gotDone = true;
      } else if (type === 'error') {
        requestId = String(event.requestId ?? '');
        const obs = event.observabilitySummary;
        if (obs && typeof obs === 'object' && 'traceId' in obs) {
          traceId = String((obs as Record<string, unknown>).traceId ?? '');
        }
        gotError = true;
        // Continue consuming the stream so we capture all events before exiting.
      } else if (type === 'cancelled') {
        requestId = String(event.requestId ?? '');
        gotError = true;
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  const eventSummary = ['thread_started', 'text', 'observation', 'done', 'error']
    .map((t) => `${t}:${eventCounts[t] ?? 0}`)
    .join(' ');

  console.log(`${TAG} threadId=${threadId ?? '(missing)'}`);
  console.log(`${TAG} requestId=${requestId ?? '(missing)'}`);
  console.log(`${TAG} traceId=${traceId ?? '(missing)'}`);
  console.log(`${TAG} events=${eventSummary}`);

  if (!gotDone || gotError) {
    const status = gotError ? 'error' : 'no-done-event';
    console.log(`${TAG} status=${status}`);
    throw new Error(`${TAG} smoke failed: status=${status}`);
  }

  if (!threadId) throw new Error(`${TAG} done event missing threadId`);
  if (!requestId) throw new Error(`${TAG} done event missing requestId`);

  console.log(`${TAG} status=success`);

  return {
    threadId,
    requestId,
    traceId: traceId || undefined,
    eventCounts,
  };
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = readBffSmokeConfig();
  await runBffSmoke(config);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

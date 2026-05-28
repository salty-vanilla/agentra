#!/usr/bin/env tsx
/**
 * BFF smoke script — verifies /health, /threads, and /chat SSE against a deployed stage.
 *
 * Usage:
 *   pnpm --filter @agentra/backend smoke:bff:health
 *   pnpm --filter @agentra/backend smoke:bff:threads
 *   pnpm --filter @agentra/backend smoke:bff:chat
 *   pnpm --filter @agentra/backend smoke:bff          # runs all three
 *
 *   tsx scripts/smoke-bff.ts [health|threads|chat|all]
 *
 * Env vars:
 *   AGENTRA_API_BASE_URL            (required for health, threads)
 *   AGENTRA_STREAMING_API_BASE_URL  (required for chat)
 *   SMOKE_JWT_TOKEN                 (required for threads, chat — add to bff-smoke.env)
 *   SMOKE_TIMEOUT_MS                (default: 30000)
 *   SMOKE_PROMPT                    (default: built-in Japanese greeting)
 *   SMOKE_THREAD_ID                 (optional — omit to let backend create a new thread)
 *   AGENTRA_STAGE                   (default: "dev" — used in summary output only)
 *
 * Preferred entry point for stage-based runs: just smoke-bff <stage> <profile>
 * That recipe sources .agentra/env/<stage>/bff-smoke.env automatically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SseEventName =
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

type SseEvent = {
  readonly name: SseEventName;
  readonly data: unknown;
};

type ChatStats = {
  readonly startedAt: number;
  readonly threadId: string | undefined;
  readonly textChars: number;
  readonly eventCounts: Readonly<Record<SseEventName, number>>;
  readonly gotTerminal: boolean;
  readonly terminalIsSuccess: boolean;
};

type BffConfig = {
  readonly apiBaseUrl: string;
  readonly streamingBaseUrl: string;
  readonly jwtToken: string | undefined;
  readonly timeoutMs: number;
  readonly prompt: string;
  readonly threadId: string | undefined;
  readonly stage: string;
};

type Subcommand = 'health' | 'threads' | 'chat' | 'all';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT = 'こんにちは。何かお手伝いできますか？';

function readConfig(): BffConfig {
  const apiBaseUrl = (process.env.AGENTRA_API_BASE_URL ?? '').replace(/\/$/, '');
  const streamingBaseUrl = (process.env.AGENTRA_STREAMING_API_BASE_URL ?? '').replace(
    /\/$/,
    '',
  );
  const jwtToken = process.env.SMOKE_JWT_TOKEN?.trim() || undefined;
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS) || 30_000;
  const prompt = process.env.SMOKE_PROMPT?.trim() || DEFAULT_PROMPT;
  const threadId = process.env.SMOKE_THREAD_ID?.trim() || undefined;
  const stage = process.env.AGENTRA_STAGE?.trim() || 'dev';

  return { apiBaseUrl, streamingBaseUrl, jwtToken, timeoutMs, prompt, threadId, stage };
}

function resolveSubcommand(): Subcommand {
  const arg = process.argv[2]?.trim().toLowerCase();
  if (arg === 'health' || arg === 'threads' || arg === 'chat' || arg === 'all')
    return arg;
  if (!arg) return 'all';
  console.error(
    `[smoke:bff] Unknown subcommand: ${arg}. Expected: health|threads|chat|all`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function requireJwt(config: BffConfig, step: string): string {
  if (!config.jwtToken) {
    console.error(
      `[smoke:bff] FAIL step=${step} reason=missing-SMOKE_JWT_TOKEN\n` +
        `  Set SMOKE_JWT_TOKEN in env or add it to .agentra/env/<stage>/bff-smoke.env`,
    );
    process.exit(1);
  }
  return config.jwtToken;
}

function requireApiBaseUrl(config: BffConfig, step: string): string {
  if (!config.apiBaseUrl) {
    console.error(
      `[smoke:bff] FAIL step=${step} reason=missing-AGENTRA_API_BASE_URL\n` +
        `  Run: just outputs-env <stage> bff-smoke`,
    );
    process.exit(1);
  }
  return config.apiBaseUrl;
}

function requireStreamingBaseUrl(config: BffConfig, step: string): string {
  if (!config.streamingBaseUrl) {
    console.error(
      `[smoke:bff] FAIL step=${step} reason=missing-AGENTRA_STREAMING_API_BASE_URL\n` +
        `  Run: just outputs-env <stage> bff-smoke`,
    );
    process.exit(1);
  }
  return config.streamingBaseUrl;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

function initialChatStats(): ChatStats {
  return {
    startedAt: Date.now(),
    threadId: undefined,
    textChars: 0,
    eventCounts: {
      thread_started: 0,
      token: 0,
      status: 0,
      observation: 0,
      progress_summary: 0,
      sub_agent_progress: 0,
      artifact: 0,
      done: 0,
      error: 0,
      cancelled: 0,
    },
    gotTerminal: false,
    terminalIsSuccess: false,
  };
}

function accumulateSseEvent(stats: ChatStats, event: SseEvent): ChatStats {
  const prevCount = stats.eventCounts[event.name] ?? 0;
  const updatedCounts = { ...stats.eventCounts, [event.name]: prevCount + 1 };

  if (event.name === 'thread_started') {
    const data = event.data as { threadId?: string } | null;
    return {
      ...stats,
      threadId: data?.threadId ?? stats.threadId,
      eventCounts: updatedCounts,
    };
  }

  if (event.name === 'token') {
    const data = event.data as { text?: string } | null;
    const chars = typeof data?.text === 'string' ? data.text.length : 0;
    return { ...stats, textChars: stats.textChars + chars, eventCounts: updatedCounts };
  }

  if (event.name === 'done') {
    return {
      ...stats,
      gotTerminal: true,
      terminalIsSuccess: true,
      eventCounts: updatedCounts,
    };
  }

  if (event.name === 'error' || event.name === 'cancelled') {
    return {
      ...stats,
      gotTerminal: true,
      terminalIsSuccess: false,
      eventCounts: updatedCounts,
    };
  }

  return { ...stats, eventCounts: updatedCounts };
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventName: string | undefined;

  try {
    while (true) {
      if (signal.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let lineEnd = buffer.indexOf('\n');
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
        buffer = buffer.slice(lineEnd + 1);
        lineEnd = buffer.indexOf('\n');

        if (line.startsWith(':')) continue; // heartbeat comment

        if (line.startsWith('event:')) {
          currentEventName = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const rawData = line.slice(5).trim();
          if (!rawData || rawData === '[DONE]') {
            currentEventName = undefined;
            continue;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          const eventName = (currentEventName ?? 'token') as SseEventName;
          yield { name: eventName, data: parsed };
          currentEventName = undefined;
          continue;
        }

        if (line === '') {
          currentEventName = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Subcommand: health
// ---------------------------------------------------------------------------

async function smokeHealth(config: BffConfig): Promise<void> {
  const base = requireApiBaseUrl(config, 'health');
  const url = `${base}/health`;
  console.log(`[smoke:bff] step=health url=${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[smoke:bff] FAIL step=health url=${url} reason=${msg}`);
    process.exit(1);
  }
  clearTimeout(timeout);

  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    console.error(
      `[smoke:bff] FAIL step=health url=${url} status=${res.status}\n  response: ${body}`,
    );
    process.exit(1);
  }

  const body = (await res.json()) as Record<string, unknown>;
  if (body.status !== 'ok') {
    console.error(
      `[smoke:bff] FAIL step=health url=${url} reason=unexpected-status body.status=${body.status}`,
    );
    process.exit(1);
  }

  console.log(
    `[smoke:bff] OK   step=health status=${res.status} body.status=${body.status}`,
  );
}

// ---------------------------------------------------------------------------
// Subcommand: threads
// ---------------------------------------------------------------------------

async function smokeThreads(config: BffConfig): Promise<void> {
  const base = requireApiBaseUrl(config, 'threads');
  const token = requireJwt(config, 'threads');
  const url = `${base}/threads`;
  console.log(`[smoke:bff] step=threads url=${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(token),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[smoke:bff] FAIL step=threads url=${url} reason=${msg}`);
    process.exit(1);
  }
  clearTimeout(timeout);

  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    console.error(
      `[smoke:bff] FAIL step=threads url=${url} status=${res.status}\n  response: ${body}`,
    );
    process.exit(1);
  }

  const body = (await res.json()) as Record<string, unknown>;
  if (!Array.isArray(body.threads)) {
    console.error(
      `[smoke:bff] FAIL step=threads url=${url} reason=missing-threads-array`,
    );
    process.exit(1);
  }

  console.log(
    `[smoke:bff] OK   step=threads status=${res.status} count=${(body.threads as unknown[]).length}`,
  );
}

// ---------------------------------------------------------------------------
// Subcommand: chat (SSE)
// ---------------------------------------------------------------------------

async function smokeChat(config: BffConfig): Promise<void> {
  const base = requireStreamingBaseUrl(config, 'chat');
  const token = requireJwt(config, 'chat');
  const url = `${base}/chat`;

  const chatBody: Record<string, unknown> = { message: config.prompt };
  if (config.threadId) chatBody.threadId = config.threadId;

  console.log(`[smoke:bff] step=chat url=${url}`);
  console.log(`[smoke:bff] prompt=${config.prompt}`);
  console.log('');
  console.log('--- response ---');

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(chatBody),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = controller.signal.aborted;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[smoke:bff] FAIL step=chat url=${url} reason=${isTimeout ? 'timeout' : msg}`,
    );
    process.exit(1);
  }

  if (res.status !== 200) {
    clearTimeout(timeout);
    const body = await res.text().catch(() => '');
    console.error(
      `[smoke:bff] FAIL step=chat url=${url} status=${res.status}\n  response: ${body}`,
    );
    process.exit(1);
  }

  if (!res.body) {
    clearTimeout(timeout);
    console.error(`[smoke:bff] FAIL step=chat url=${url} reason=no-response-body`);
    process.exit(1);
  }

  let stats = initialChatStats();

  try {
    for await (const event of parseSseStream(res.body, controller.signal)) {
      stats = accumulateSseEvent(stats, event);

      if (event.name === 'token') {
        const data = event.data as { text?: string } | null;
        if (typeof data?.text === 'string') process.stdout.write(data.text);
      } else if (event.name === 'thread_started') {
        const data = event.data as { threadId?: string } | null;
        console.log(`\n[thread_started] threadId=${data?.threadId ?? '?'}`);
      } else if (event.name === 'done') {
        console.log('\n[done]');
      } else if (event.name === 'error') {
        const data = event.data as { message?: string; error?: string } | null;
        console.error(
          `\n[error] ${data?.message ?? data?.error ?? JSON.stringify(data)}`,
        );
      } else if (event.name === 'cancelled') {
        console.log('\n[cancelled]');
      }

      if (stats.gotTerminal) break;
    }
  } catch (error) {
    clearTimeout(timeout);
    const isTimeout = controller.signal.aborted;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `\n[smoke:bff] FAIL step=chat url=${url} reason=${isTimeout ? 'timeout' : msg}`,
    );
    process.exit(1);
  }

  clearTimeout(timeout);

  const totalEvents = Object.values(stats.eventCounts).reduce((a, b) => a + b, 0);
  const elapsedMs = Date.now() - stats.startedAt;

  console.log('');
  console.log('--- summary ---');
  console.log(`stage          : ${config.stage}`);
  console.log(`threadId       : ${stats.threadId ?? '(none)'}`);
  console.log(`elapsedMs      : ${elapsedMs}`);
  console.log(`textChars      : ${stats.textChars}`);
  console.log(
    `events         : thread_started=${stats.eventCounts.thread_started} token=${stats.eventCounts.token} status=${stats.eventCounts.status} done=${stats.eventCounts.done} error=${stats.eventCounts.error} cancelled=${stats.eventCounts.cancelled}`,
  );

  if (!stats.gotTerminal) {
    console.error(
      `[smoke:bff] FAIL step=chat url=${url} status=200 reason=no-terminal-event totalEvents=${totalEvents}`,
    );
    process.exit(1);
  }

  if (!stats.terminalIsSuccess) {
    const reason =
      stats.eventCounts.error > 0
        ? 'error-event'
        : stats.eventCounts.cancelled > 0
          ? 'cancelled-event'
          : 'terminal-failure';
    console.error(`[smoke:bff] FAIL step=chat url=${url} reason=${reason}`);
    process.exit(1);
  }

  console.log(`status         : success`);
  console.log(`[smoke:bff] OK   step=chat`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = readConfig();
  const subcommand = resolveSubcommand();

  switch (subcommand) {
    case 'health':
      await smokeHealth(config);
      break;
    case 'threads':
      await smokeThreads(config);
      break;
    case 'chat':
      await smokeChat(config);
      break;
    case 'all':
      await smokeHealth(config);
      console.log('');
      await smokeThreads(config);
      console.log('');
      await smokeChat(config);
      break;
  }
}

main().catch((error: unknown) => {
  console.error(
    '[smoke:bff] fatal:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});

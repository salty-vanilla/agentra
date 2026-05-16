import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelKey = 'opus' | 'sonnet' | 'haiku';

const MODEL_ID_MAP: Record<ModelKey, string> = {
  opus: 'global.anthropic.claude-opus-4-6-v1',
  sonnet: 'global.anthropic.claude-sonnet-4-6',
  haiku: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
};

export type SubAgentStage = {
  readonly stage: string;
  readonly status: 'running' | 'complete' | 'error';
  readonly durationMs?: number;
};

const chatObservationToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().min(1).optional(),
});

const chatObservationSummarySchema = z.object({
  traceId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  tokenUsage: z
    .object({
      inputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0),
    })
    .optional(),
  reasoning: z
    .object({
      stepCount: z.number().int().min(0),
      summary: z.string().optional(),
    })
    .optional(),
  toolCalls: z.array(chatObservationToolCallSchema),
  toolCallCount: z.number().int().min(0),
  toolFailureCount: z.number().int().min(0),
});

type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;

export type RuntimeStreamEvent =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'observation';
      readonly observation: ChatObservationSummary;
      readonly subAgentStage?: SubAgentStage;
    }
  | { readonly type: 'done'; readonly observabilitySummary?: ChatObservationSummary }
  | {
      readonly type: 'error';
      readonly error: string;
      readonly observabilitySummary?: ChatObservationSummary;
    };

export type SmokeConfig = {
  readonly region: string;
  readonly runtimeArn: string;
  readonly qualifier: string | undefined;
  readonly model: ModelKey;
  readonly userId: string;
  readonly sessionId: string;
  readonly traceId: string;
  readonly timeoutMs: number;
  readonly strict: boolean;
};

export type EventCounts = {
  readonly text: number;
  readonly observation: number;
  readonly done: number;
  readonly error: number;
};

export type SmokeStats = {
  readonly startedAt: number;
  readonly textChars: number;
  readonly eventCounts: EventCounts;
  readonly toolNames: readonly string[];
};

export type ParsedArgs = {
  readonly prompt: string | undefined;
  readonly sessionId: string | undefined;
  readonly model: ModelKey | undefined;
  readonly timeoutMs: number | undefined;
  readonly strict: boolean;
};

// ---------------------------------------------------------------------------
// Config & arg parsing
// ---------------------------------------------------------------------------

export function readConfig(runtimeArnEnv = 'AGENTCORE_RUNTIME_ARN'): SmokeConfig {
  const runtimeArn = process.env[runtimeArnEnv]?.trim() ?? '';
  if (!runtimeArn) {
    throw new Error(
      `[smoke] Missing required env var: ${runtimeArnEnv}\n` +
        `  Set it to your deployed AgentCore Runtime ARN, e.g.:\n` +
        `  export ${runtimeArnEnv}=arn:aws:bedrock-agentcore:...`,
    );
  }
  const region = process.env.AWS_REGION?.trim() || 'ap-northeast-1';
  const qualifier = process.env.AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;
  const model = (process.env.SMOKE_MODEL?.trim() as ModelKey | undefined) ?? 'sonnet';
  const userId = process.env.SMOKE_USER_ID?.trim() || 'smoke-user-local';
  const sessionId = process.env.SMOKE_THREAD_ID?.trim() || uuidv7();
  const traceId = process.env.SMOKE_TRACE_ID?.trim() || uuidv7();
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS) || 300_000;
  const strict = process.env.SMOKE_STRICT === 'true';

  const arnSuffix = runtimeArn.length > 20 ? `...${runtimeArn.slice(-20)}` : runtimeArn;
  console.log(
    `[smoke] region=${region} arn=${arnSuffix} qualifier=${qualifier ?? '(none)'} model=${model}`,
  );
  console.log(`[smoke] traceId=${traceId} sessionId=${sessionId}`);

  return {
    region,
    runtimeArn,
    qualifier,
    model,
    userId,
    sessionId,
    traceId,
    timeoutMs,
    strict,
  };
}

export function parseArgs(
  defaultPrompt: string,
  config: SmokeConfig,
): {
  readonly prompt: string;
  readonly config: SmokeConfig;
} {
  const args = process.argv.slice(2);
  let prompt = defaultPrompt;
  let sessionId = config.sessionId;
  let model = config.model;
  let timeoutMs = config.timeoutMs;
  let strict = config.strict;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' && args[i + 1]) {
      prompt = args[i + 1] ?? defaultPrompt;
      i++;
    } else if (arg === '--session-id' && args[i + 1]) {
      sessionId = args[i + 1] ?? sessionId;
      i++;
    } else if (arg === '--model' && args[i + 1]) {
      model = (args[i + 1] as ModelKey | undefined) ?? model;
      i++;
    } else if (arg === '--timeout-ms' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (!Number.isNaN(parsed)) timeoutMs = parsed;
      i++;
    } else if (arg === '--strict') {
      strict = true;
    } else if (!arg?.startsWith('--')) {
      prompt = arg ?? defaultPrompt;
    }
  }

  return {
    prompt,
    config: { ...config, sessionId, model, timeoutMs, strict },
  };
}

// ---------------------------------------------------------------------------
// Stream parsing (self-contained, mirroring bedrock-agent.ts logic)
// ---------------------------------------------------------------------------

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

function parseObservation(raw: unknown): ChatObservationSummary | undefined {
  const result = chatObservationSummarySchema.safeParse(raw);
  if (!result.success) return undefined;
  return result.data;
}

function isSubAgentStage(value: unknown): value is SubAgentStage {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<SubAgentStage>;
  return (
    typeof c.stage === 'string' &&
    c.stage.length > 0 &&
    (c.status === 'running' || c.status === 'complete' || c.status === 'error')
  );
}

function parseEvent(raw: string): RuntimeStreamEvent | undefined {
  try {
    const parsed = JSON.parse(raw) as
      | { event?: string; data?: unknown }
      | {
          type?: string;
          text?: string;
          observation?: unknown;
          subAgentStage?: unknown;
          observabilitySummary?: unknown;
          error?: string;
        };

    const payload =
      parsed && typeof parsed === 'object' && 'event' in parsed ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object') return undefined;

    const typed = payload as {
      type?: string;
      text?: string;
      observation?: unknown;
      subAgentStage?: unknown;
      observabilitySummary?: unknown;
      error?: string;
    };

    if (typed.type === 'text' && typeof typed.text === 'string') {
      return { type: 'text', text: typed.text };
    }
    if (typeof typed.text === 'string') {
      return { type: 'text', text: typed.text };
    }
    if (typed.type === 'observation' && typed.observation) {
      const observation = parseObservation(typed.observation);
      if (!observation) return undefined;
      return {
        type: 'observation',
        observation,
        ...(isSubAgentStage(typed.subAgentStage)
          ? { subAgentStage: typed.subAgentStage as SubAgentStage }
          : {}),
      };
    }
    if (typed.type === 'done') {
      const obs = typed.observabilitySummary
        ? parseObservation(typed.observabilitySummary)
        : undefined;
      return obs ? { type: 'done', observabilitySummary: obs } : { type: 'done' };
    }
    if (typed.type === 'error' && typeof typed.error === 'string') {
      const obs = typed.observabilitySummary
        ? parseObservation(typed.observabilitySummary)
        : undefined;
      return obs
        ? { type: 'error', error: typed.error, observabilitySummary: obs }
        : { type: 'error', error: typed.error };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function* streamBody(
  contentType: string | undefined,
  body: unknown,
  abortSignal: AbortSignal,
): AsyncGenerator<RuntimeStreamEvent> {
  const streamable = body as {
    transformToString?: () => Promise<string>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (streamable?.[Symbol.asyncIterator]) {
    const isSse = contentType?.includes('text/event-stream') ?? false;
    let buffer = '';

    for await (const chunk of streamable as AsyncIterable<unknown>) {
      if (abortSignal.aborted) return;
      buffer += decodeChunk(chunk);

      if (isSse) {
        let lineBreakIdx = buffer.indexOf('\n');
        while (lineBreakIdx >= 0) {
          const line = buffer.slice(0, lineBreakIdx).trim();
          buffer = buffer.slice(lineBreakIdx + 1);
          lineBreakIdx = buffer.indexOf('\n');
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const evt = parseEvent(data);
          if (evt) {
            yield evt;
            continue;
          }
          yield { type: 'text', text: data };
        }
      } else if (buffer.trim()) {
        const evt = parseEvent(buffer.trim());
        if (evt) {
          yield evt;
          buffer = '';
        } else {
          yield { type: 'text', text: buffer.trim() };
          buffer = '';
        }
      }
    }

    if (!isSse && buffer.trim()) {
      const evt = parseEvent(buffer.trim());
      if (evt) yield evt;
      else yield { type: 'text', text: buffer.trim() };
    }
    return;
  }

  if (streamable?.transformToString) {
    const payload = await streamable.transformToString();
    const evt = parseEvent(payload);
    if (evt) yield evt;
    else if (payload.trim()) yield { type: 'text', text: payload.trim() };
  }
}

// ---------------------------------------------------------------------------
// Runtime invocation
// ---------------------------------------------------------------------------

export function buildPayload(
  config: SmokeConfig,
  prompt: string,
  commandDirective?: string,
): Record<string, unknown> {
  return {
    prompt,
    model: config.model,
    threadId: config.sessionId,
    traceId: config.traceId,
    userId: config.userId,
    ...(commandDirective ? { commandDirective } : {}),
  };
}

export async function* streamRuntime(
  config: SmokeConfig,
  payload: Record<string, unknown>,
): AsyncGenerator<RuntimeStreamEvent> {
  const client = new BedrockAgentCoreClient({ region: config.region });
  const controller = new AbortController();
  let timedOut = false;

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: config.runtimeArn,
      ...(config.qualifier ? { qualifier: config.qualifier } : {}),
      runtimeSessionId: config.sessionId,
      traceId: config.traceId,
      contentType: 'application/json',
      accept: 'text/event-stream',
      payload: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const response = await client.send(command, { abortSignal: controller.signal });
    if (!response.response) return;

    yield* streamBody(response.contentType, response.response, controller.signal);
  } catch (error) {
    if (timedOut) {
      yield {
        type: 'error',
        error: `AgentCore invocation timed out after ${config.timeoutMs}ms`,
      };
      return;
    }
    if (controller.signal.aborted) {
      yield { type: 'error', error: 'AgentCore invocation was cancelled' };
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    yield { type: 'error', error: `AgentCore invocation failed: ${msg}` };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ---------------------------------------------------------------------------
// Stats helpers (immutable updates)
// ---------------------------------------------------------------------------

export function initialStats(): SmokeStats {
  return {
    startedAt: Date.now(),
    textChars: 0,
    eventCounts: { text: 0, observation: 0, done: 0, error: 0 },
    toolNames: [],
  };
}

export function accumulateEvent(
  stats: SmokeStats,
  event: RuntimeStreamEvent,
): SmokeStats {
  switch (event.type) {
    case 'text':
      return {
        ...stats,
        textChars: stats.textChars + event.text.length,
        eventCounts: { ...stats.eventCounts, text: stats.eventCounts.text + 1 },
      };
    case 'observation': {
      const newToolNames = event.observation.toolCalls.map((tc) => tc.toolName);
      return {
        ...stats,
        eventCounts: {
          ...stats.eventCounts,
          observation: stats.eventCounts.observation + 1,
        },
        toolNames: [...stats.toolNames, ...newToolNames],
      };
    }
    case 'done':
      return {
        ...stats,
        eventCounts: { ...stats.eventCounts, done: stats.eventCounts.done + 1 },
      };
    case 'error':
      return {
        ...stats,
        eventCounts: { ...stats.eventCounts, error: stats.eventCounts.error + 1 },
      };
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export function printSummary(config: SmokeConfig, stats: SmokeStats): void {
  const elapsedMs = Date.now() - stats.startedAt;
  const toolList =
    stats.toolNames.length > 0 ? [...new Set(stats.toolNames)].join(', ') : '(none)';
  console.log('');
  const stage = process.env.AGENTRA_STAGE ?? 'dev';
  console.log('--- summary ---');
  console.log(`traceId        : ${config.traceId}`);
  console.log(`runtimeSessionId: ${config.sessionId}`);
  console.log(`trace logs     : just agentcore-logs-trace ${stage} ${config.traceId}`);
  console.log(
    `session logs   : just agentcore-logs-session ${stage} ${config.sessionId}`,
  );
  console.log(`elapsedMs      : ${elapsedMs}`);
  console.log(`textChars      : ${stats.textChars}`);
  console.log(
    `events         : text=${stats.eventCounts.text} observation=${stats.eventCounts.observation} done=${stats.eventCounts.done} error=${stats.eventCounts.error}`,
  );
  console.log(`tools observed : ${toolList}`);
  const status =
    stats.eventCounts.error > 0
      ? 'error'
      : stats.eventCounts.done > 0
        ? 'success'
        : 'no-done';
  console.log(`status         : ${status}`);
}

export function getModelId(model: ModelKey): string {
  return MODEL_ID_MAP[model];
}

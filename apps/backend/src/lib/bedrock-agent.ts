import {
  type ChatObservationSummary,
  chatObservationSummarySchema,
} from '@agentra/shared';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { createCallTelemetry, formatTelemetryLog } from './timeout-handler.js';

export type SubAgentStage = {
  stage: string;
  status: 'running' | 'complete' | 'error';
  durationMs?: number;
};

export type ModelKey = 'opus' | 'sonnet' | 'haiku';
export type RuntimeStreamEvent =
  | { type: 'text'; text: string }
  | {
      type: 'observation';
      observation: ChatObservationSummary;
      subAgentStage?: SubAgentStage;
    }
  | { type: 'done'; observabilitySummary?: ChatObservationSummary }
  | { type: 'error'; error: string; observabilitySummary?: ChatObservationSummary };

const MODEL_ID_MAP: Record<ModelKey, string> = {
  opus: 'global.anthropic.claude-opus-4-6-v1',
  sonnet: 'global.anthropic.claude-sonnet-4-6',
  haiku: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
};

const AGENTCORE_INVOKE_TIMEOUT_MS = 300000; // 5 minutes

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? 'us-east-1',
});

const AGENTCORE_RUNTIME_ARN = process.env.AGENTCORE_RUNTIME_ARN ?? '';
const AGENTCORE_RUNTIME_QUALIFIER =
  process.env.AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

function decodeRuntimeChunk(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return new TextDecoder().decode(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(chunk));
  }
  if (ArrayBuffer.isView(chunk)) {
    return new TextDecoder().decode(
      new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    );
  }
  return String(chunk ?? '');
}

function parseObservationSummary(raw: unknown): ChatObservationSummary | undefined {
  const result = chatObservationSummarySchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      '[bedrock-agent] invalid observation summary dropped',
      JSON.stringify(result.error.issues),
    );
    return undefined;
  }
  return result.data;
}

function parseWrappedRuntimeEvent(raw: string): RuntimeStreamEvent | undefined {
  try {
    const parsed = JSON.parse(raw) as
      | {
          event?: string;
          data?: unknown;
        }
      | {
          type?: string;
          text?: string;
          observation?: ChatObservationSummary;
          subAgentStage?: SubAgentStage;
          observabilitySummary?: ChatObservationSummary;
          error?: string;
        };

    const payload =
      parsed && typeof parsed === 'object' && 'event' in parsed ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const typed = payload as {
      type?: string;
      text?: string;
      observation?: ChatObservationSummary;
      subAgentStage?: SubAgentStage;
      observabilitySummary?: ChatObservationSummary;
      error?: string;
    };

    if (typed.type === 'text' && typeof typed.text === 'string') {
      return { type: 'text', text: typed.text };
    }
    // BedrockAgentCoreApp streaming may emit payloads as {"text":"..."} (without type).
    if (typeof typed.text === 'string') {
      return { type: 'text', text: typed.text };
    }
    if (typed.type === 'observation' && typed.observation) {
      const observation = parseObservationSummary(typed.observation);
      if (!observation) return undefined;
      return {
        type: 'observation',
        observation,
        ...(isSubAgentStage(typed.subAgentStage)
          ? { subAgentStage: typed.subAgentStage }
          : {}),
      };
    }
    if (typed.type === 'done') {
      const observabilitySummary = typed.observabilitySummary
        ? parseObservationSummary(typed.observabilitySummary)
        : undefined;
      return observabilitySummary
        ? { type: 'done', observabilitySummary }
        : { type: 'done' };
    }
    if (typed.type === 'error' && typeof typed.error === 'string') {
      const observabilitySummary = typed.observabilitySummary
        ? parseObservationSummary(typed.observabilitySummary)
        : undefined;
      return {
        type: 'error',
        error: typed.error,
        ...(observabilitySummary ? { observabilitySummary } : {}),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isSubAgentStage(value: unknown): value is SubAgentStage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SubAgentStage>;
  return (
    typeof candidate.stage === 'string' &&
    candidate.stage.length > 0 &&
    (candidate.status === 'running' ||
      candidate.status === 'complete' ||
      candidate.status === 'error') &&
    (candidate.durationMs === undefined ||
      (Number.isInteger(candidate.durationMs) && candidate.durationMs >= 0))
  );
}

async function* streamAgentCoreBody(
  contentType: string | undefined,
  body: unknown,
  abortSignal?: AbortSignal,
): AsyncGenerator<RuntimeStreamEvent> {
  const streamBody = body as {
    transformToString?: () => Promise<string>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (streamBody?.[Symbol.asyncIterator]) {
    const isSse = contentType?.includes('text/event-stream') ?? false;
    let buffer = '';

    for await (const chunk of streamBody as AsyncIterable<unknown>) {
      if (abortSignal?.aborted) {
        return;
      }

      buffer += decodeRuntimeChunk(chunk);

      if (isSse) {
        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex >= 0) {
          const line = buffer.slice(0, lineBreakIndex).trim();
          buffer = buffer.slice(lineBreakIndex + 1);
          lineBreakIndex = buffer.indexOf('\n');

          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') {
            continue;
          }

          const parsed = parseWrappedRuntimeEvent(data);
          if (parsed) {
            yield parsed;
            continue;
          }

          yield { type: 'text', text: data };
        }
      } else if (buffer.trim()) {
        const parsed = parseWrappedRuntimeEvent(buffer.trim());
        if (parsed) {
          yield parsed;
          buffer = '';
        } else {
          yield { type: 'text', text: buffer.trim() };
          buffer = '';
        }
      }
    }

    if (!isSse && buffer.trim()) {
      const parsed = parseWrappedRuntimeEvent(buffer.trim());
      if (parsed) {
        yield parsed;
      } else {
        yield { type: 'text', text: buffer.trim() };
      }
    }
    return;
  }

  if (streamBody?.transformToString) {
    const payload = await streamBody.transformToString();
    const parsed = parseWrappedRuntimeEvent(payload);
    if (parsed) {
      yield parsed;
    } else if (payload.trim()) {
      yield { type: 'text', text: payload.trim() };
    }
  }
}

export function buildRuntimePayload(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
  traceId?: string,
  extra?: { userId?: string; commandDirective?: string; requestId?: string },
): Record<string, unknown> {
  return {
    prompt: inputText,
    model: modelKey,
    ...(extra?.commandDirective ? { commandDirective: extra.commandDirective } : {}),
    ...(traceId ? { traceId } : {}),
    ...(extra?.userId ? { userId: extra.userId } : {}),
    ...(sessionId ? { threadId: sessionId } : {}),
    ...(extra?.requestId ? { requestId: extra.requestId } : {}),
  };
}

async function* invokeAgentCoreRuntimeStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
  traceId?: string,
  extra?: { userId?: string; commandDirective?: string; requestId?: string },
  abortSignal?: AbortSignal,
): AsyncGenerator<RuntimeStreamEvent> {
  if (!AGENTCORE_RUNTIME_ARN) {
    throw new Error('AGENTCORE_RUNTIME_ARN is not set. AgentCore runtime is required.');
  }

  const telemetry = createCallTelemetry();
  const invokeController = new AbortController();
  let invocationTimedOut = false;

  const invokeTimeoutHandle = setTimeout(() => {
    invocationTimedOut = true;
    console.warn(
      `[bedrock-agent] invoke timeout: Operation exceeded ${AGENTCORE_INVOKE_TIMEOUT_MS}ms`,
    );
    invokeController.abort();
  }, AGENTCORE_INVOKE_TIMEOUT_MS);

  try {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: AGENTCORE_RUNTIME_ARN,
      qualifier: AGENTCORE_RUNTIME_QUALIFIER,
      runtimeSessionId: sessionId,
      ...(traceId ? { traceId } : {}),
      contentType: 'application/json',
      accept: 'text/event-stream',
      payload: new TextEncoder().encode(
        JSON.stringify(
          buildRuntimePayload(modelKey, sessionId, inputText, traceId, extra),
        ),
      ),
    });

    const signal = abortSignal || invokeController.signal;
    const response = await agentCoreClient.send(command, { abortSignal: signal });

    if (!response.response) {
      return;
    }

    yield* streamAgentCoreBody(response.contentType, response.response, abortSignal);
  } catch (error) {
    const logMessage = formatTelemetryLog('bedrock-agent-invoke', telemetry);
    if (invocationTimedOut) {
      console.error(
        `[bedrock-agent] ${logMessage} - invocation timed out after ${AGENTCORE_INVOKE_TIMEOUT_MS}ms`,
      );
      yield {
        type: 'error',
        error: `AgentCore invocation timed out after ${AGENTCORE_INVOKE_TIMEOUT_MS}ms`,
      };
      return;
    }

    if (abortSignal?.aborted) {
      console.warn(`[bedrock-agent] ${logMessage} - invocation was cancelled`);
      yield {
        type: 'error',
        error: 'AgentCore invocation was cancelled',
      };
      return;
    }

    console.error(`[bedrock-agent] ${logMessage}`, error);
    yield {
      type: 'error',
      error: `AgentCore invocation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(invokeTimeoutHandle);
    telemetry.completedAt = Date.now();
    telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
  }
}

/**
 * Streams runtime events from an AgentCore Runtime invocation.
 * Uses thread.threadId as runtime sessionId so context is preserved
 * across messages within the same thread.
 */
export async function* invokeAgentStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
  traceId?: string,
  extra?: { userId?: string; commandDirective?: string; requestId?: string },
  abortSignal?: AbortSignal,
): AsyncGenerator<RuntimeStreamEvent> {
  yield* invokeAgentCoreRuntimeStream(
    modelKey,
    sessionId,
    inputText,
    traceId,
    extra,
    abortSignal,
  );
}

export function getModelId(modelKey: ModelKey): string {
  return MODEL_ID_MAP[modelKey];
}

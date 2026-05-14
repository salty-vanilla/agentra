import {
  APP_NAME,
  APP_VERSION,
  type ChatObservationSummary,
  GetHealthResponse,
  GetThreadResponse,
  ListThreadMessagesResponse,
  ListThreadsResponse,
  type ThreadSummary,
  UpdateThreadBody,
} from '@agentra/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { uuidv7 } from 'uuidv7';
import { getModelId, invokeAgentStream, type ModelKey } from './lib/bedrock-agent.js';
import { type ChatCommand, chatCommandSchema } from './lib/chat-command.js';
import type { ProgressSummaryEvent, SubAgentProgressEvent } from './lib/chat-stream.js';
import { buildRouterCommandDirective } from './lib/command-directive.js';
import { jsonWithValidation, readJsonBody, validateRequest } from './lib/openapi.js';
import { createAbortableSleep, createSseResponse } from './lib/sse.js';
import { authMiddleware } from './middleware/auth.js';
import {
  appendMessage,
  createThread,
  deleteThread,
  getThread,
  getThreadMessages,
  listThreads,
  updateThreadTitle,
} from './store/index.js';

type HonoEnv = {
  Variables: {
    userId: string;
  };
};

type ObservationStatus = 'success' | 'error' | 'cancelled';
const OBSERVABILITY_DEBUG_LOG = process.env.OBSERVABILITY_DEBUG_LOG === 'true';
const DEFAULT_SSE_HEARTBEAT_INTERVAL_MS = 15_000;

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(iso: string): number {
  return new Date(iso).getTime();
}

function getSseHeartbeatIntervalMs(): number {
  const parsed = Number(process.env.SSE_HEARTBEAT_INTERVAL_MS ?? '');
  if (Number.isFinite(parsed) && parsed >= 1_000) {
    return parsed;
  }

  return DEFAULT_SSE_HEARTBEAT_INTERVAL_MS;
}

function createFallbackObservabilitySummary(input: {
  traceId: string;
  startedAt: string;
  completedAt: string;
  status: ObservationStatus;
}): ChatObservationSummary {
  return {
    traceId: input.traceId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: Math.max(0, toMillis(input.completedAt) - toMillis(input.startedAt)),
    status: input.status,
    toolCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
  };
}

function logObservabilityDebug(
  stage: 'observation' | 'done' | 'error',
  summary: ChatObservationSummary | undefined,
  extra?: Record<string, unknown>,
) {
  if (!OBSERVABILITY_DEBUG_LOG || !summary) {
    return;
  }

  const payload = {
    stage,
    traceId: summary.traceId,
    status: summary.status,
    durationMs: summary.durationMs,
    totalTokens: summary.tokenUsage?.totalTokens,
    inputTokens: summary.tokenUsage?.inputTokens,
    outputTokens: summary.tokenUsage?.outputTokens,
    toolCallCount: summary.toolCallCount,
    toolFailureCount: summary.toolFailureCount,
    toolCallIds: summary.toolCalls
      .map((tool: ChatObservationSummary['toolCalls'][number]) => tool.toolCallId)
      .filter((toolCallId): toolCallId is string => typeof toolCallId === 'string'),
    toolNames: summary.toolCalls.map(
      (tool: ChatObservationSummary['toolCalls'][number]) => tool.toolName,
    ),
    ...extra,
  };

  console.info('[observability-debug]', JSON.stringify(payload));
}

const app = new Hono<HonoEnv>();

app.use('*', cors());
app.use('/chat', authMiddleware);
app.use('/threads/*', authMiddleware);
app.use('/threads', authMiddleware);

app.use('*', cors());

app.get('/', (context) => {
  return context.json({
    name: APP_NAME,
    version: APP_VERSION,
    endpoints: [
      '/health',
      '/chat',
      '/threads',
      '/threads/:threadId',
      '/threads/:threadId/messages',
    ],
  });
});

app.get('/health', (context) => {
  const response = GetHealthResponse.parse({
    status: 'ok',
    service: 'backend',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });

  return jsonWithValidation(context, 'getHealth', 200, response);
});

app.post('/chat', async (context) => {
  const validationResponse = await validateRequest(context, 'postChat');
  if (validationResponse) {
    return validationResponse;
  }

  const payload = await readJsonBody(context);
  const parsed = payload as {
    message: string;
    threadId?: string;
    model?: ModelKey;
    command?: ChatCommand;
  };

  const { message, threadId } = parsed;
  const modelKey: ModelKey = parsed.model ?? 'sonnet';
  const command = parsed.command;
  const userId = context.get('userId');
  const traceId = uuidv7();

  // Validate command if present
  if (command) {
    const commandResult = chatCommandSchema.safeParse(command);
    if (!commandResult.success) {
      return jsonWithValidation(context, 'postChat', 400, {
        error: `Invalid command: ${commandResult.error.issues.map((issue) => issue.message).join(', ')}`,
      });
    }
  }

  let thread: ThreadSummary;

  if (threadId) {
    const existingThread = await getThread(threadId, userId);
    if (!existingThread) {
      return jsonWithValidation(context, 'postChat', 404, {
        error: 'Thread not found.',
      });
    }
    thread = existingThread;
  } else {
    thread = await createThread({ initialMessage: message, userId });
  }

  await appendMessage({
    threadId: thread.threadId,
    role: 'user',
    content: message,
  });

  return createSseResponse(context.req.raw.signal, async (stream) => {
    const startedAt = nowIso();
    let fullReply = '';
    let latestObservabilitySummary: ChatObservationSummary | undefined;
    const isSlideCommand = command?.type === 'create_slide_presentation';
    const heartbeatIntervalMs = getSseHeartbeatIntervalMs();
    const upstreamAbortController = new AbortController();
    const heartbeatAbortController = new AbortController();

    await stream.writeEvent({
      event: 'thread_started',
      data: { type: 'thread_started', threadId: thread.threadId },
    });

    async function emitProgress(
      phase: ProgressSummaryEvent['phase'],
      title: string,
      summary: string,
    ) {
      const event: ProgressSummaryEvent = {
        type: 'progress_summary',
        phase,
        title,
        summary,
        timestamp: nowIso(),
      };
      await stream.writeEvent({
        event: 'status',
        data: { type: 'progress_summary', event },
      });
    }

    async function emitSubAgentProgress(
      progress: Omit<SubAgentProgressEvent, 'type' | 'timestamp'>,
    ) {
      const event: SubAgentProgressEvent = {
        type: 'sub_agent_progress',
        stage: progress.stage,
        status: progress.status,
        timestamp: nowIso(),
        ...(progress.durationMs !== undefined ? { durationMs: progress.durationMs } : {}),
      };
      await stream.writeEvent({
        event: 'sub_agent_progress',
        data: { type: 'sub_agent_progress', event },
      });
    }

    stream.onAbort(() => {
      console.info(
        `Client disconnected from /chat SSE stream (threadId=${thread.threadId}, traceId=${traceId}).`,
      );
      upstreamAbortController.abort();
      heartbeatAbortController.abort();
    });

    const heartbeatTask = (async () => {
      while (!heartbeatAbortController.signal.aborted) {
        await createAbortableSleep(heartbeatAbortController.signal, heartbeatIntervalMs);
        if (heartbeatAbortController.signal.aborted) {
          break;
        }

        await stream.writeComment('ping');
      }
    })();

    try {
      const commandDirective = command ? buildRouterCommandDirective(command) : undefined;

      // Emit a simple "in progress" message for slide commands.
      // TODO: Replace with real pipeline progress events once the Router
      // supports progress callbacks from tool execution (see: progress
      // channel / merge-iterables approach).
      if (isSlideCommand) {
        await emitProgress(
          'router_handoff',
          'スライドを作成しています',
          'Presentation Author エージェントが資料を生成中です。しばらくお待ちください。',
        );
      }

      for await (const runtimeEvent of invokeAgentStream(
        modelKey,
        thread.threadId,
        message,
        traceId,
        { userId, ...(commandDirective ? { commandDirective } : {}) },
        upstreamAbortController.signal,
      )) {
        if (runtimeEvent.type === 'text') {
          fullReply += runtimeEvent.text;
          await stream.writeEvent({
            event: 'token',
            data: { type: 'text', text: runtimeEvent.text },
          });
          continue;
        }

        if (runtimeEvent.type === 'observation') {
          latestObservabilitySummary = runtimeEvent.observation;
          logObservabilityDebug('observation', latestObservabilitySummary, {
            threadId: thread.threadId,
          });
          if (runtimeEvent.subAgentStage) {
            await emitSubAgentProgress(runtimeEvent.subAgentStage);
          }
          await stream.writeEvent({
            event: 'observation',
            data: {
              type: 'observation',
              observation: runtimeEvent.observation,
            },
          });
          continue;
        }

        if (runtimeEvent.type === 'done') {
          latestObservabilitySummary =
            runtimeEvent.observabilitySummary ?? latestObservabilitySummary;
          continue;
        }

        if (runtimeEvent.type === 'error') {
          latestObservabilitySummary =
            runtimeEvent.observabilitySummary ?? latestObservabilitySummary;
          throw new Error(runtimeEvent.error);
        }
      }
    } catch (err) {
      if (context.req.raw.signal.aborted || upstreamAbortController.signal.aborted) {
        await heartbeatTask.catch(() => undefined);
        return;
      }

      console.error('Bedrock agent stream error:', err);
      const completedAt = nowIso();
      const fallbackSummary =
        latestObservabilitySummary ??
        createFallbackObservabilitySummary({
          traceId,
          startedAt,
          completedAt,
          status: 'error',
        });
      logObservabilityDebug('error', fallbackSummary, { threadId: thread.threadId });
      await stream.writeEvent({
        event: 'error',
        data: {
          type: 'error',
          threadId: thread.threadId,
          error: `Agent invocation failed. traceId=${traceId}`,
          observabilitySummary: fallbackSummary,
        },
      });
      heartbeatAbortController.abort();
      await heartbeatTask.catch(() => undefined);
      return;
    }

    if (context.req.raw.signal.aborted || upstreamAbortController.signal.aborted) {
      heartbeatAbortController.abort();
      await heartbeatTask.catch(() => undefined);
      return;
    }

    const completedAt = nowIso();
    const finalSummary =
      latestObservabilitySummary ??
      createFallbackObservabilitySummary({
        traceId,
        startedAt,
        completedAt,
        status: 'success',
      });
    logObservabilityDebug('done', finalSummary, { threadId: thread.threadId });

    await appendMessage({
      threadId: thread.threadId,
      role: 'assistant',
      content: fullReply,
      observabilitySummary: finalSummary,
    });

    await stream.writeEvent({
      event: 'done',
      data: {
        type: 'done',
        threadId: thread.threadId,
        model: getModelId(modelKey),
        createdAt: completedAt,
        observabilitySummary: finalSummary,
      },
    });

    heartbeatAbortController.abort();
    await heartbeatTask.catch(() => undefined);
  });
});

app.get('/threads', async (context) => {
  const response = ListThreadsResponse.parse({
    threads: await listThreads(context.get('userId')),
  });

  return jsonWithValidation(context, 'listThreads', 200, response);
});

app.post('/threads', async (context) => {
  const validationResponse = await validateRequest(context, 'createThread');
  if (validationResponse) {
    return validationResponse;
  }

  const payload = await readJsonBody(context);
  const parsed = (payload ?? {}) as {
    title?: string;
  };

  const thread = await createThread(
    parsed.title
      ? { title: parsed.title, userId: context.get('userId') }
      : { userId: context.get('userId') },
  );

  const response = GetThreadResponse.parse({
    thread,
  });

  return jsonWithValidation(context, 'createThread', 201, response);
});

app.get('/threads/:threadId', async (context) => {
  const validationResponse = await validateRequest(context, 'getThread');
  if (validationResponse) {
    return validationResponse;
  }

  const threadId = context.req.param('threadId');
  const thread = await getThread(threadId, context.get('userId'));

  if (!thread) {
    return jsonWithValidation(context, 'getThread', 404, {
      error: 'Thread not found.',
    });
  }

  const response = GetThreadResponse.parse({
    thread,
  });

  return jsonWithValidation(context, 'getThread', 200, response);
});

app.get('/threads/:threadId/messages', async (context) => {
  const validationResponse = await validateRequest(context, 'listThreadMessages');
  if (validationResponse) {
    return validationResponse;
  }

  const threadId = context.req.param('threadId');
  const thread = await getThread(threadId, context.get('userId'));

  if (!thread) {
    return jsonWithValidation(context, 'listThreadMessages', 404, {
      error: 'Thread not found.',
    });
  }

  const response = ListThreadMessagesResponse.parse({
    thread,
    messages: await getThreadMessages(threadId),
  });

  return jsonWithValidation(context, 'listThreadMessages', 200, response);
});

app.patch('/threads/:threadId', async (context) => {
  const validationResponse = await validateRequest(context, 'updateThread');
  if (validationResponse) {
    return validationResponse;
  }

  const payload = await readJsonBody(context);
  const parsed = UpdateThreadBody.parse(payload ?? {});
  const normalizedTitle = parsed.title.trim();
  if (normalizedTitle.length === 0) {
    return jsonWithValidation(context, 'updateThread', 400, {
      error: 'Thread title must not be blank.',
    });
  }

  const thread = await updateThreadTitle({
    threadId: context.req.param('threadId'),
    userId: context.get('userId'),
    title: normalizedTitle,
  });

  if (!thread) {
    return jsonWithValidation(context, 'updateThread', 404, {
      error: 'Thread not found.',
    });
  }

  const response = GetThreadResponse.parse({
    thread,
  });
  return jsonWithValidation(context, 'updateThread', 200, response);
});

app.delete('/threads/:threadId', async (context) => {
  const validationResponse = await validateRequest(context, 'deleteThread');
  if (validationResponse) {
    return validationResponse;
  }

  const deleted = await deleteThread({
    threadId: context.req.param('threadId'),
    userId: context.get('userId'),
  });

  if (!deleted) {
    return jsonWithValidation(context, 'deleteThread', 404, {
      error: 'Thread not found.',
    });
  }

  const response = GetThreadResponse.parse({
    thread: deleted,
  });
  return jsonWithValidation(context, 'deleteThread', 200, response);
});

app.onError((error, context) => {
  console.error(error);
  return context.json(
    {
      error: 'Internal server error.',
    },
    500,
  );
});

export { app };

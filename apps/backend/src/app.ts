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
import { streamSSE } from 'hono/streaming';
import { uuidv7 } from 'uuidv7';
import { getModelId, invokeAgentStream, type ModelKey } from './lib/bedrock-agent.js';
import { type ChatCommand, chatCommandSchema } from './lib/chat-command.js';
import type { ProgressSummaryEvent } from './lib/chat-stream.js';
import { buildRouterCommandDirective } from './lib/command-directive.js';
import { jsonWithValidation, readJsonBody, validateRequest } from './lib/openapi.js';
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

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(iso: string): number {
  return new Date(iso).getTime();
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
    history?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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

  return streamSSE(context, async (stream) => {
    const startedAt = nowIso();
    let fullReply = '';
    let latestObservabilitySummary: ChatObservationSummary | undefined;

    const isSlideCommand = command?.type === 'create_slide_presentation';

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
      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress_summary', event }),
      });
    }

    try {
      // Build the effective prompt: append command directive if present
      const effectiveMessage = command
        ? `${message}\n\n${buildRouterCommandDirective(command)}`
        : message;

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
        effectiveMessage,
        traceId,
        { userId },
      )) {
        if (runtimeEvent.type === 'text') {
          fullReply += runtimeEvent.text;
          await stream.writeSSE({
            data: JSON.stringify({ type: 'text', text: runtimeEvent.text }),
          });
          continue;
        }

        if (runtimeEvent.type === 'observation') {
          latestObservabilitySummary = runtimeEvent.observation;
          logObservabilityDebug('observation', latestObservabilitySummary, {
            threadId: thread.threadId,
          });
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'observation',
              observation: runtimeEvent.observation,
            }),
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
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          error: `Agent invocation failed. traceId=${traceId}`,
          observabilitySummary: fallbackSummary,
        }),
      });
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

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'done',
        threadId: thread.threadId,
        model: getModelId(modelKey),
        createdAt: completedAt,
        observabilitySummary: finalSummary,
      }),
    });
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

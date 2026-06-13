import {
  APP_NAME,
  APP_VERSION,
  type ArtifactManifest,
  type ChatObservationSummary,
  type DeckSnapshotDeps,
  GetArtifactDownloadUrlResponse,
  GetHealthResponse,
  GetThreadResponse,
  getDeckSnapshot,
  ListThreadArtifactsResponse,
  ListThreadMessagesResponse,
  ListThreadsResponse,
  normalizeObservabilityRecord,
  type ThreadSummary,
  UpdateThreadBody,
} from '@agentra/shared';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { uuidv7 } from 'uuidv7';
import { getModelId, invokeAgentStream, type ModelKey } from './lib/bedrock-agent.js';
import { type ChatCommand, chatCommandSchema } from './lib/chat-command.js';
import type { ProgressSummaryEvent, SubAgentProgressEvent } from './lib/chat-stream.js';
import { buildRouterCommandDirective } from './lib/command-directive.js';
import { sanitizeErrorMessage, sanitizeErrorStack } from './lib/error-sanitize.js';
import { jsonWithValidation, readJsonBody, validateRequest } from './lib/openapi.js';
import { createAbortableSleep, createSseResponse } from './lib/sse.js';
import { adminAuthMiddleware } from './middleware/admin-auth.js';
import { authMiddleware } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { adminObservabilityRouter } from './routes/admin-observability.js';
import { adminUsersRouter } from './routes/admin-users.js';
import { knowledgeBaseRouter } from './routes/knowledge-base.js';
import {
  appendMessage,
  createThread,
  deleteThread,
  getThread,
  getThreadMessages,
  listThreads,
  updateThreadTitle,
} from './store/index.js';
import { putObservabilityRecord } from './store/observability-store.js';

type HonoEnv = {
  Variables: {
    userId: string;
    requestId: string;
    userGroups: string[];
    callerSub: string;
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

async function persistObservabilityRecord(input: {
  summary: ChatObservationSummary;
  requestId: string;
  threadId: string;
  userId: string;
  model: string;
  modelKey: ModelKey;
  assistantMessageId?: string;
}): Promise<void> {
  const record = normalizeObservabilityRecord({
    summary: input.summary,
    requestId: input.requestId,
    threadId: input.threadId,
    userId: input.userId,
    model: input.model,
    modelKey: input.modelKey,
    ...(input.assistantMessageId ? { assistantMessageId: input.assistantMessageId } : {}),
  });
  await putObservabilityRecord(record);
}

const app = new Hono<HonoEnv>();

app.use('*', requestIdMiddleware);

const allowedOrigins = process.env.ALLOWED_CORS_ORIGINS?.split(',').map((origin) =>
  origin.trim(),
) ?? ['http://localhost:3000'];

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    // `x-id-token` carries the verified Cognito ID token used only for
    // projecting profile claims (email / displayName) into the UserTable.
    allowHeaders: ['content-type', 'authorization', 'x-id-token'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  }),
);
app.use('/chat', authMiddleware);
app.use('/threads/*', authMiddleware);
app.use('/threads', authMiddleware);
app.use('/admin/*', authMiddleware);
app.use('/admin/*', adminAuthMiddleware);
app.route('/admin/observability', adminObservabilityRouter);
app.route('/admin/users', adminUsersRouter);
app.use('/knowledge-base/*', authMiddleware);
app.use('/knowledge-base/*', adminAuthMiddleware);
app.route('/knowledge-base', knowledgeBaseRouter);

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
  const requestId = context.get('requestId');
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

  return createSseResponse(
    context.req.raw.signal,
    async (stream) => {
      const startedAt = nowIso();
      let fullReply = '';
      let latestObservabilitySummary: ChatObservationSummary | undefined;
      let latestArtifactManifest: ArtifactManifest | undefined;
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
          ...(progress.durationMs !== undefined
            ? { durationMs: progress.durationMs }
            : {}),
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
          await createAbortableSleep(
            heartbeatAbortController.signal,
            heartbeatIntervalMs,
          );
          if (heartbeatAbortController.signal.aborted) {
            break;
          }

          await stream.writeComment('ping');
        }
      })();

      try {
        const commandDirective = command
          ? buildRouterCommandDirective(command)
          : undefined;

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
          {
            userId,
            requestId,
            ...(commandDirective ? { commandDirective } : {}),
          },
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

          if (runtimeEvent.type === 'artifact_manifest') {
            latestArtifactManifest = runtimeEvent.manifest;
            await stream.writeEvent({
              event: 'artifact',
              data: { type: 'artifact', manifest: runtimeEvent.manifest },
            });
            continue;
          }

          if (runtimeEvent.type === 'deck_progress') {
            // Streaming Deck Preview (Epic #403): forward progress so the client
            // can reveal slides incrementally. Additive and degradable — the
            // final `artifact` event still carries the authoritative deck.
            await stream.writeEvent({
              event: 'deck_progress',
              data: { type: 'deck_progress', event: runtimeEvent.event },
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

        const completedAt = nowIso();
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;

        console.error('Chat stream error', {
          requestId,
          traceId,
          threadId: thread.threadId,
          errorMessage: sanitizeErrorMessage(errorMessage),
          errorName: err instanceof Error ? err.name : 'Unknown',
          durationMs: toMillis(completedAt) - toMillis(startedAt),
          userId,
        });

        const fallbackSummary =
          latestObservabilitySummary ??
          createFallbackObservabilitySummary({
            traceId,
            startedAt,
            completedAt,
            status: 'error',
          });
        logObservabilityDebug('error', fallbackSummary, { threadId: thread.threadId });

        // Send error event to client
        await stream.writeEvent({
          event: 'error',
          data: {
            type: 'error',
            threadId: thread.threadId,
            requestId,
            error: `Agent invocation failed. traceId=${traceId}`,
            observabilitySummary: fallbackSummary,
          },
        });

        // Persist error record to database
        const sanitized = sanitizeErrorStack(errorStack);
        const errorRecord = {
          threadId: thread.threadId,
          role: 'assistant' as const,
          content: '',
          observabilitySummary: fallbackSummary,
          requestId,
          errorMessage: sanitizeErrorMessage(errorMessage),
          ...(sanitized ? { errorStack: sanitized } : {}),
        };
        const errorMsg = await appendMessage(errorRecord).catch((dbErr) => {
          console.error('Failed to persist error record', {
            traceId,
            requestId,
            dbErr: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });
        await persistObservabilityRecord({
          summary: fallbackSummary,
          requestId,
          threadId: thread.threadId,
          userId,
          model: getModelId(modelKey),
          modelKey,
          ...(errorMsg?.messageId ? { assistantMessageId: errorMsg.messageId } : {}),
        }).catch((dbErr) => {
          console.error('Failed to persist error observability record', {
            traceId,
            requestId,
            dbErr: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });

        heartbeatAbortController.abort();
        await heartbeatTask.catch(() => undefined);
        return;
      }

      if (context.req.raw.signal.aborted || upstreamAbortController.signal.aborted) {
        const cancelledAt = nowIso();
        const cancellationSummary = createFallbackObservabilitySummary({
          traceId,
          startedAt,
          completedAt: cancelledAt,
          status: 'cancelled',
        });

        console.info('Chat stream cancelled', {
          requestId,
          traceId,
          threadId: thread.threadId,
          durationMs: toMillis(cancelledAt) - toMillis(startedAt),
          userId,
        });

        // Send cancellation event to client
        await stream.writeEvent({
          event: 'cancelled',
          data: {
            type: 'cancelled',
            threadId: thread.threadId,
            requestId,
            observabilitySummary: cancellationSummary,
          },
        });

        // Persist cancellation record to database
        const cancelMsg = await appendMessage({
          threadId: thread.threadId,
          role: 'assistant',
          content: '',
          observabilitySummary: cancellationSummary,
          requestId,
          cancelledAt,
        }).catch((dbErr) => {
          console.error('Failed to persist cancellation record', {
            traceId,
            requestId,
            dbErr: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });
        await persistObservabilityRecord({
          summary: cancellationSummary,
          requestId,
          threadId: thread.threadId,
          userId,
          model: getModelId(modelKey),
          modelKey,
          ...(cancelMsg?.messageId ? { assistantMessageId: cancelMsg.messageId } : {}),
        }).catch((dbErr) => {
          console.error('Failed to persist cancellation observability record', {
            traceId,
            requestId,
            dbErr: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });

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

      const successMsg = await appendMessage({
        threadId: thread.threadId,
        role: 'assistant',
        content: fullReply,
        observabilitySummary: finalSummary,
        ...(latestArtifactManifest ? { artifactManifest: latestArtifactManifest } : {}),
        requestId,
      });
      await persistObservabilityRecord({
        summary: finalSummary,
        requestId,
        threadId: thread.threadId,
        userId,
        model: getModelId(modelKey),
        modelKey,
        assistantMessageId: successMsg.messageId,
      }).catch((dbErr) => {
        console.error('Failed to persist success observability record', {
          traceId,
          requestId,
          dbErr: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      });

      await stream.writeEvent({
        event: 'done',
        data: {
          type: 'done',
          threadId: thread.threadId,
          requestId,
          model: getModelId(modelKey),
          createdAt: completedAt,
          observabilitySummary: finalSummary,
        },
      });

      heartbeatAbortController.abort();
      await heartbeatTask.catch(() => undefined);
    },
    requestId,
  );
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

app.get('/threads/:threadId/artifacts', async (context) => {
  const validationResponse = await validateRequest(context, 'listThreadArtifacts');
  if (validationResponse) {
    return validationResponse;
  }

  const threadId = context.req.param('threadId');
  const thread = await getThread(threadId, context.get('userId'));

  if (!thread) {
    return jsonWithValidation(context, 'listThreadArtifacts', 404, {
      error: 'Thread not found.',
    });
  }

  const messages = await getThreadMessages(threadId);
  const manifests = messages.flatMap((m) =>
    m.artifactManifest != null ? [m.artifactManifest] : [],
  );

  const response = ListThreadArtifactsResponse.parse({ manifests });
  return jsonWithValidation(context, 'listThreadArtifacts', 200, response);
});

const ARTIFACT_PRESIGN_EXPIRY_SECONDS = 900;

app.get('/threads/:threadId/artifacts/:artifactId/download-url', async (context) => {
  const validationResponse = await validateRequest(context, 'getArtifactDownloadUrl');
  if (validationResponse) {
    return validationResponse;
  }

  const threadId = context.req.param('threadId');
  const artifactId = context.req.param('artifactId');
  const userId = context.get('userId');

  const thread = await getThread(threadId, userId);
  if (!thread) {
    return jsonWithValidation(context, 'getArtifactDownloadUrl', 404, {
      error: 'Thread not found.',
    });
  }

  const messages = await getThreadMessages(threadId);
  let artifactPath: string | undefined;

  outer: for (const message of messages) {
    for (const artifact of message.artifactManifest?.artifacts ?? []) {
      if (artifact.id === artifactId) {
        if (!artifact.path || artifact.exists === false) {
          return jsonWithValidation(context, 'getArtifactDownloadUrl', 404, {
            error: 'Artifact not available.',
          });
        }
        artifactPath = artifact.path;
        break outer;
      }
    }
  }

  if (!artifactPath) {
    return jsonWithValidation(context, 'getArtifactDownloadUrl', 404, {
      error: 'Artifact not found.',
    });
  }

  if (!artifactPath.startsWith('runs/')) {
    return jsonWithValidation(context, 'getArtifactDownloadUrl', 404, {
      error: 'Artifact not found.',
    });
  }

  const bucketName = process.env.ARTIFACT_BUCKET_NAME;
  if (!bucketName) {
    return jsonWithValidation(context, 'getArtifactDownloadUrl', 503, {
      error: 'Artifact storage not configured.',
    });
  }

  const s3 = new S3Client({});
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucketName, Key: artifactPath }),
    { expiresIn: ARTIFACT_PRESIGN_EXPIRY_SECONDS },
  );
  const expiresAt = new Date(
    Date.now() + ARTIFACT_PRESIGN_EXPIRY_SECONDS * 1000,
  ).toISOString();

  const response = GetArtifactDownloadUrlResponse.parse({ url, expiresAt });
  return jsonWithValidation(context, 'getArtifactDownloadUrl', 200, response);
});

const DECK_SNAPSHOT_PRESIGN_EXPIRY_SECONDS = 900;

/** Build the S3-backed snapshot deps (list/read/presign) for a bucket. */
function deckSnapshotDeps(s3: S3Client, bucketName: string): DeckSnapshotDeps {
  return {
    async listKeys(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const res = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async readJson(key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        const body = await res.Body?.transformToString();
        return body ? (JSON.parse(body) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    async readText(key) {
      // Used for `specs/outline.md` to derive slide skeleton messages (#446).
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        return (await res.Body?.transformToString()) ?? null;
      } catch {
        return null;
      }
    },
    async presign(key) {
      try {
        return await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucketName, Key: key }),
          { expiresIn: DECK_SNAPSHOT_PRESIGN_EXPIRY_SECONDS },
        );
      } catch {
        // Honour the DeckSnapshotDeps contract: never throw, degrade to null.
        return null;
      }
    },
  };
}

// Authoritative Deck Workspace snapshot (Epic #422): the source of truth for the
// live preview. The SSE deck_progress stream (#421) is only a refetch trigger;
// reloads and reconnects restore the full state from this endpoint alone.
app.get('/threads/:threadId/decks/:deckId', async (context) => {
  const validationResponse = await validateRequest(context, 'getDeckSnapshot');
  if (validationResponse) {
    return validationResponse;
  }

  const threadId = context.req.param('threadId');
  const deckId = context.req.param('deckId');
  // Defence in depth: a deckId is a uuid-like safe segment. Reject anything that
  // could traverse the S3 prefix before any ownership lookup or S3 call.
  if (!/^[A-Za-z0-9._-]+$/.test(deckId) || deckId.includes('..')) {
    return jsonWithValidation(context, 'getDeckSnapshot', 404, {
      error: 'Deck not found.',
    });
  }
  const thread = await getThread(threadId, context.get('userId'));
  if (!thread) {
    return jsonWithValidation(context, 'getDeckSnapshot', 404, {
      error: 'Thread not found.',
    });
  }

  // Authorize the deck against the thread: it must be referenced by one of the
  // thread's message manifests (prevents reading an arbitrary deck by id).
  const messages = await getThreadMessages(threadId);
  const ownsDeck = messages.some((m) => m.artifactManifest?.deck?.deckId === deckId);
  if (!ownsDeck) {
    return jsonWithValidation(context, 'getDeckSnapshot', 404, {
      error: 'Deck not found.',
    });
  }

  const bucketName = process.env.ARTIFACT_BUCKET_NAME;
  if (!bucketName) {
    return jsonWithValidation(context, 'getDeckSnapshot', 503, {
      error: 'Deck storage not configured.',
    });
  }

  const snapshot = await getDeckSnapshot(
    { deckId },
    deckSnapshotDeps(new S3Client({}), bucketName),
  );
  if (!snapshot) {
    return jsonWithValidation(context, 'getDeckSnapshot', 404, {
      error: 'Deck not found.',
    });
  }

  return jsonWithValidation(context, 'getDeckSnapshot', 200, snapshot);
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

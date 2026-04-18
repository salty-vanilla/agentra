import {
  APP_NAME,
  APP_VERSION,
  chatResponseSchema,
  healthResponseSchema,
  threadMessagesResponseSchema,
  updateThreadRequestSchema,
  threadResponseSchema,
  threadsResponseSchema,
} from '@agentra/shared';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.js';
import { jsonWithValidation, readJsonBody, validateRequest } from './lib/openapi.js';
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
    endpoints: ['/health', '/chat', '/threads', '/threads/:threadId', '/threads/:threadId/messages'],
  });
});

app.get('/health', (context) => {
  const response = healthResponseSchema.parse({
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
  };

  const history = parsed.history ?? [];
  const { message, threadId } = parsed;
  const userId = context.get('userId');
  let thread;

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

  const reply = buildDummyReply(message, history.length);
  await appendMessage({
    threadId: thread.threadId,
    role: 'assistant',
    content: reply,
  });

  const response = chatResponseSchema.parse({
    threadId: thread.threadId,
    reply,
    model: 'dummy-agent-v1',
    createdAt: new Date().toISOString(),
  });

  return jsonWithValidation(context, 'postChat', 200, response);
});

app.get('/threads', async (context) => {
  const response = threadsResponseSchema.parse({
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

  const response = threadResponseSchema.parse({
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

  const response = threadResponseSchema.parse({
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

  const response = threadMessagesResponseSchema.parse({
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
  const parsed = updateThreadRequestSchema.parse(payload ?? {});
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

  const response = threadResponseSchema.parse({
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

  const response = threadResponseSchema.parse({
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

function buildDummyReply(message: string, historyLength: number) {
  const normalized = message.toLowerCase();

  if (normalized.includes('phase 2') || normalized.includes('認証')) {
    return [
      'Phase 2 では認証境界を先に固めるのが筋です。',
      'frontend では認証済み UI の分岐、backend ではトークン検証後の app user 解決を追加してください。',
      `現在の会話履歴件数は ${historyLength} 件で、thread 単位の制御をあとから足せる形にしてあります。`,
    ].join('\n');
  }

  if (normalized.includes('製造') || normalized.includes('line') || normalized.includes('ライン')) {
    return [
      '製造ライン向けには、設備マニュアル、エラーコード、センサー状態を AgentCore 側のツールとして追加するのが自然です。',
      'UI には通常チャットに加えて、設備別スレッド、引用表示、構造化データ照会結果の表示面を持たせると拡張しやすくなります。',
    ].join('\n');
  }

  return [
    `受け取ったメッセージ: 「${message}」`,
    '現在は Hono backend のダミー応答です。次の段階で AgentCore 呼び出しに置き換える想定です。',
    `thread と history を受け取る API 形状にしてあるため、将来の履歴保存や Agent セッション連携へそのまま進められます。`,
  ].join('\n');
}

export { app, serve };

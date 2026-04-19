import {
  APP_NAME,
  APP_VERSION,
  healthResponseSchema,
  threadMessagesResponseSchema,
  threadResponseSchema,
  threadsResponseSchema,
  updateThreadRequestSchema,
} from '@agentra/shared';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { getModelId, invokeAgentStream, type ModelKey } from './lib/bedrock-agent.js';
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
    model?: ModelKey;
  };

  const { message, threadId } = parsed;
  const modelKey: ModelKey = parsed.model ?? 'sonnet';
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

  return streamSSE(context, async (stream) => {
    let fullReply = '';

    try {
      for await (const chunk of invokeAgentStream(modelKey, thread.threadId, message)) {
        fullReply += chunk;
        await stream.writeSSE({ data: JSON.stringify({ type: 'text', text: chunk }) });
      }
    } catch (err) {
      console.error('Bedrock agent stream error:', err);
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', error: 'Agent invocation failed.' }),
      });
      return;
    }

    await appendMessage({
      threadId: thread.threadId,
      role: 'assistant',
      content: fullReply,
    });

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'done',
        threadId: thread.threadId,
        model: getModelId(modelKey),
        createdAt: new Date().toISOString(),
      }),
    });
  });
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



export { app, serve };

import { APP_VERSION } from '@agentra/shared';
import { HttpResponse } from 'msw';
import { uuidv7 } from 'uuidv7';
import {
  getCreateThreadMockHandler,
  getDeleteThreadMockHandler,
  getGetHealthMockHandler,
  getGetThreadMockHandler,
  getListThreadMessagesMockHandler,
  getListThreadsMockHandler,
  getPostChatMockHandler,
  getUpdateThreadMockHandler,
} from '@/mocks/generated/agentra.msw';
import type {
  ChatObservationSummary,
  ChatRequest,
  CreateThreadRequest,
  HealthResponse,
  MessageRole,
  PersistedChatMessage,
  ThreadMessagesResponse,
  ThreadResponse,
  ThreadSummary,
  ThreadsResponse,
  UpdateThreadRequest,
} from '@/mocks/generated/model';

type CreateThreadInput = {
  title?: string;
  initialMessage?: string;
};

const threadStore = new Map<string, ThreadSummary>();
const messageStore = new Map<string, PersistedChatMessage[]>();

seedStore();

export const handlers = [
  getGetHealthMockHandler(
    (): HealthResponse => ({
      status: 'ok',
      service: 'frontend-mock',
      version: APP_VERSION,
      timestamp: now(),
    }),
  ),
  getListThreadsMockHandler(
    (): ThreadsResponse => ({
      threads: listThreads(),
    }),
  ),
  getCreateThreadMockHandler(async ({ request }): Promise<ThreadResponse> => {
    const payload = await request.json().catch(() => null);
    const parsed = parseCreateThreadRequest(payload);

    if (!parsed.success) {
      throw HttpResponse.json(
        {
          error: 'Invalid thread request.',
        },
        { status: 400 },
      );
    }

    const thread = createThread(
      parsed.data.title
        ? {
            title: parsed.data.title,
          }
        : {},
    );

    return {
      thread,
    };
  }),
  getGetThreadMockHandler(({ params }): ThreadResponse => {
    const threadId = String(params.threadId);
    const thread = getThread(threadId);

    if (!thread) {
      throw HttpResponse.json(
        {
          error: 'Thread not found.',
        },
        { status: 404 },
      );
    }

    return {
      thread,
    };
  }),
  getListThreadMessagesMockHandler(({ params }): ThreadMessagesResponse => {
    const threadId = String(params.threadId);
    const thread = getThread(threadId);

    if (!thread) {
      throw HttpResponse.json(
        {
          error: 'Thread not found.',
        },
        { status: 404 },
      );
    }

    return {
      thread,
      messages: getThreadMessages(threadId),
    };
  }),
  getUpdateThreadMockHandler(async ({ params, request }): Promise<ThreadResponse> => {
    const threadId = String(params.threadId);
    const thread = getThread(threadId);

    if (!thread) {
      throw HttpResponse.json(
        {
          error: 'Thread not found.',
        },
        { status: 404 },
      );
    }

    const payload = await request.json().catch(() => null);
    const parsed = parseUpdateThreadRequest(payload);

    if (!parsed.success) {
      throw HttpResponse.json(
        {
          error: 'Invalid thread update request.',
        },
        { status: 400 },
      );
    }

    const updatedThread: ThreadSummary = {
      ...thread,
      title: parsed.data.title.trim(),
      updatedAt: now(),
    };

    threadStore.set(threadId, updatedThread);

    return {
      thread: updatedThread,
    };
  }),
  getDeleteThreadMockHandler(({ params }): ThreadResponse => {
    const threadId = String(params.threadId);
    const thread = getThread(threadId);

    if (!thread) {
      throw HttpResponse.json(
        {
          error: 'Thread not found.',
        },
        { status: 404 },
      );
    }

    threadStore.delete(threadId);
    messageStore.delete(threadId);

    return {
      thread,
    };
  }),
  getPostChatMockHandler(async ({ request }): Promise<string> => {
    const payload = await request.json().catch(() => null);
    const parsed = parseChatRequest(payload);

    if (!parsed.success) {
      throw HttpResponse.json(
        {
          error: 'Invalid chat request.',
        },
        { status: 400 },
      );
    }

    const { message, threadId } = parsed.data;
    const thread = threadId
      ? (getThread(threadId) ?? createThread({ initialMessage: message }))
      : createThread({ initialMessage: message });

    appendMessage({
      threadId: thread.threadId,
      role: 'user',
      content: message,
    });

    const reply = buildDummyReply(message);
    const observabilitySummary = buildDummyObservabilitySummary(message);

    appendMessage({
      threadId: thread.threadId,
      role: 'assistant',
      content: reply,
      observabilitySummary,
    });

    return JSON.stringify({
      threadId: thread.threadId,
      reply,
      model: 'msw-dummy-agent-v1',
      createdAt: now(),
      observabilitySummary,
    });
  }),
];

function now() {
  return new Date().toISOString();
}

function listThreads() {
  return Array.from(threadStore.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function getThread(threadId: string) {
  return threadStore.get(threadId);
}

function getThreadMessages(threadId: string) {
  return messageStore.get(threadId) ?? [];
}

function createThread(input: CreateThreadInput = {}) {
  const timestamp = now();
  const threadId = uuidv7();
  const thread: ThreadSummary = {
    threadId,
    title: buildThreadTitle(input.title, input.initialMessage),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.initialMessage ? { preview: input.initialMessage } : {}),
  };

  threadStore.set(threadId, thread);
  messageStore.set(threadId, []);

  return thread;
}

function appendMessage(input: {
  threadId: string;
  role: MessageRole;
  content: string;
  observabilitySummary?: ChatObservationSummary;
}) {
  const timestamp = now();
  const message: PersistedChatMessage = {
    messageId: uuidv7(),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: timestamp,
    ...(input.observabilitySummary
      ? { observabilitySummary: input.observabilitySummary }
      : {}),
  };

  const currentMessages = messageStore.get(input.threadId) ?? [];
  currentMessages.push(message);
  messageStore.set(input.threadId, currentMessages);

  const existingThread = threadStore.get(input.threadId);
  if (existingThread) {
    threadStore.set(input.threadId, {
      ...existingThread,
      updatedAt: timestamp,
      preview: input.content,
      title:
        existingThread.title === 'New Chat'
          ? buildThreadTitle(undefined, input.content)
          : existingThread.title,
    });
  }

  return message;
}

function buildThreadTitle(title?: string, fallbackMessage?: string) {
  if (title?.trim()) {
    return title.trim();
  }

  if (fallbackMessage?.trim()) {
    return fallbackMessage.trim().slice(0, 40);
  }

  return 'New Chat';
}

function parseCreateThreadRequest(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {
      success: true as const,
      data: {},
    };
  }

  const title = 'title' in payload ? payload.title : undefined;
  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return {
      success: false as const,
    };
  }

  return {
    success: true as const,
    data: title
      ? ({
          title,
        } satisfies CreateThreadRequest)
      : ({} satisfies CreateThreadRequest),
  };
}

function parseUpdateThreadRequest(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false as const,
    };
  }

  const title = 'title' in payload ? payload.title : undefined;
  if (typeof title !== 'string' || title.trim().length === 0) {
    return {
      success: false as const,
    };
  }

  return {
    success: true as const,
    data: {
      title,
    } satisfies UpdateThreadRequest,
  };
}

function parseChatRequest(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {
      success: false as const,
    };
  }

  const message = 'message' in payload ? payload.message : undefined;
  const threadId = 'threadId' in payload ? payload.threadId : undefined;

  if (typeof message !== 'string' || message.trim().length === 0) {
    return {
      success: false as const,
    };
  }

  if (
    threadId !== undefined &&
    (typeof threadId !== 'string' || threadId.trim().length === 0)
  ) {
    return {
      success: false as const,
    };
  }

  return {
    success: true as const,
    data: {
      message,
      ...(threadId ? { threadId } : {}),
    } satisfies ChatRequest,
  };
}

function buildDummyObservabilitySummary(message?: string): ChatObservationSummary {
  const normalized = (message ?? '').toLowerCase();
  const ts = now();
  const start = new Date(Date.now() - 1400).toISOString();

  const toolCalls: ChatObservationSummary['toolCalls'] = [];

  if (normalized.includes('製造') || normalized.includes('line')) {
    toolCalls.push(
      {
        toolCallId: 'tc-r',
        toolName: 'router',
        startedAt: start,
        durationMs: 120,
        status: 'success',
      },
      {
        toolCallId: 'tc-ml',
        toolName: 'manufacturing_line',
        startedAt: start,
        durationMs: 950,
        status: 'success',
      },
    );
  } else if (normalized.includes('エラー') || normalized.includes('error')) {
    toolCalls.push(
      {
        toolCallId: 'tc-r',
        toolName: 'router',
        startedAt: start,
        durationMs: 90,
        status: 'success',
      },
      {
        toolCallId: 'tc-w',
        toolName: 'web_research',
        startedAt: start,
        durationMs: 300,
        status: 'error',
        error: 'Search quota exceeded',
      },
      {
        toolCallId: 'tc-kb',
        toolName: 'kb_retrieve',
        startedAt: start,
        durationMs: 420,
        status: 'success',
      },
    );
  } else {
    toolCalls.push(
      {
        toolCallId: 'tc-r',
        toolName: 'router',
        startedAt: start,
        durationMs: 110,
        status: 'success',
      },
      {
        toolCallId: 'tc-w',
        toolName: 'web_research',
        startedAt: start,
        durationMs: 870,
        status: 'success',
      },
    );
  }

  return {
    traceId: `mock-trace-${uuidv7()}`,
    startedAt: start,
    completedAt: ts,
    durationMs: 1380,
    status: toolCalls.some((tc) => tc.status === 'error') ? 'error' : 'success',
    tokenUsage: { inputTokens: 1240, outputTokens: 380, totalTokens: 1620 },
    toolCalls,
    toolCallCount: toolCalls.length,
    toolFailureCount: toolCalls.filter((tc) => tc.status === 'error').length,
  };
}

function buildDummyReply(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('phase 2') || normalized.includes('認証')) {
    return [
      'Phase 2 では認証境界を先に固めるのが筋です。',
      'frontend では認証済み UI の分岐、backend ではトークン検証後の app user 解決を追加してください。',
    ].join('\n');
  }

  if (
    normalized.includes('製造') ||
    normalized.includes('line') ||
    normalized.includes('ライン')
  ) {
    return [
      '製造ライン向けには、設備マニュアル、エラーコード、センサー状態を AgentCore 側のツールとして追加するのが自然です。',
      'UI には通常チャットに加えて、設備別スレッド、引用表示、構造化データ照会結果の表示面を持たせると拡張しやすくなります。',
    ].join('\n');
  }

  return [
    `受け取ったメッセージ: 「${message}」`,
    '現在は frontend の MSW モック応答です。BFF が未起動でも UI とスレッド遷移を確認できます。',
    'API 形状は OpenAPI 契約から生成しているため、実 API と mock の乖離を抑えやすくしています。',
  ].join('\n');
}

function seedStore() {
  const threadId = 'thread-mock-001';
  const createdAt = '2026-04-18T00:05:00.000Z';
  const updatedAt = '2026-04-18T00:06:30.000Z';

  threadStore.set(threadId, {
    threadId,
    title: 'Mock 開発スレッド',
    createdAt,
    updatedAt,
    preview: 'frontend 単体でチャット UI の確認を進めるための初期データです。',
  });

  messageStore.set(threadId, [
    {
      messageId: 'msg-mock-001',
      threadId,
      role: 'user',
      content: 'backend がなくても UI を作り込めますか？',
      createdAt: '2026-04-18T00:05:20.000Z',
    },
    {
      messageId: 'msg-mock-002',
      threadId,
      role: 'assistant',
      content:
        'MSW で API 契約を保ったままモックすれば、frontend 単体でも十分に進められます。',
      createdAt: '2026-04-18T00:05:32.000Z',
      observabilitySummary: buildDummyObservabilitySummary(),
    },
  ]);
}

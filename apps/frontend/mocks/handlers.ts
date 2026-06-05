import { APP_VERSION } from '@agentra/shared';
import { HttpResponse, http } from 'msw';
import { uuidv7 } from 'uuidv7';
import {
  DECK_MOCK_ASSET_PATTERN,
  mockDeckSnapshot,
  resolveDeckMockAsset,
} from '@/mocks/fixtures/deck';
import { observabilityFixtures } from '@/mocks/fixtures/observability';
import {
  getCreateThreadMockHandler,
  getDeleteKbDocumentMockHandler,
  getDeleteThreadMockHandler,
  getGetAdminAgentsMockHandler,
  getGetAdminOverviewMockHandler,
  getGetAdminSkillsMockHandler,
  getGetAdminTimeseriesMockHandler,
  getGetAdminToolsMockHandler,
  getGetAdminTraceDetailMockHandler,
  getGetAdminTracesMockHandler,
  getGetAdminUsersMockHandler,
  getGetDeckSnapshotMockHandler,
  getGetHealthMockHandler,
  getGetKbStatusMockHandler,
  getGetThreadMockHandler,
  getListAdminUsersMockHandler,
  getListKbDocumentsMockHandler,
  getListKbIngestionJobsMockHandler,
  getListThreadMessagesMockHandler,
  getListThreadsMockHandler,
  getPostChatMockHandler,
  getPresignKbDocumentMockHandler,
  getStartKbSyncMockHandler,
  getUpdateThreadMockHandler,
} from '@/mocks/generated/agentra.msw';
import type {
  AdminTraceDetail,
  AdminTraceListItem,
  ArtifactManifest,
  ArtifactRef,
  ChatCommand,
  ChatObservationSummary,
  ChatRequest,
  CreateThreadRequest,
  DeckSnapshotResponse,
  HealthResponse,
  IngestionJobSummary,
  KbDocument,
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

// ─── Knowledge-base in-memory mock store ─────────────────────────────────────

const kbDocumentStore = new Map<string, KbDocument>([
  [
    'manufacturing-line/machine-a-manual.pdf',
    {
      key: 'manufacturing-line/machine-a-manual.pdf',
      name: 'machine-a-manual.pdf',
      sizeBytes: 2_457_600,
      lastModified: '2026-05-20T10:00:00.000Z',
    },
  ],
  [
    'manufacturing-line/safety-checklist.docx',
    {
      key: 'manufacturing-line/safety-checklist.docx',
      name: 'safety-checklist.docx',
      sizeBytes: 89_600,
      lastModified: '2026-05-18T08:30:00.000Z',
    },
  ],
]);

const kbJobStore = new Map<string, IngestionJobSummary>([
  [
    'job-complete-001',
    {
      jobId: 'job-complete-001',
      status: 'COMPLETE',
      startedAt: '2026-05-20T10:05:00.000Z',
      completedAt: '2026-05-20T10:06:12.000Z',
    },
  ],
]);

// Maps uploadId → pending upload metadata so the fake S3 PUT can resolve the key
const pendingKbUploads = new Map<
  string,
  { key: string; fileName: string; sizeBytes: number }
>();

// ─── Admin observability mock data ───────────────────────────────────────────

const MOCK_TRACES: AdminTraceListItem[] = [
  {
    traceId: 'trace-mock-001',
    userId: 'user-mock-001',
    startedAt: '2026-05-24T09:12:00.000Z',
    completedAt: '2026-05-24T09:12:02.340Z',
    durationMs: 2340,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 3120,
    estimatedCostUsd: 0.0094,
    toolCallCount: 3,
    agentCallCount: 1,
    skillCallCount: 0,
  },
  {
    traceId: 'trace-mock-002',
    userId: 'user-mock-002',
    startedAt: '2026-05-24T09:08:45.000Z',
    completedAt: '2026-05-24T09:08:47.800Z',
    durationMs: 2800,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 4850,
    estimatedCostUsd: 0.0146,
    toolCallCount: 2,
    agentCallCount: 1,
    skillCallCount: 1,
  },
  {
    traceId: 'trace-mock-003',
    userId: 'user-mock-001',
    startedAt: '2026-05-24T08:55:10.000Z',
    completedAt: '2026-05-24T08:55:11.200Z',
    durationMs: 1200,
    status: 'error',
    model: 'claude-sonnet-4-6',
    totalTokens: 980,
    estimatedCostUsd: 0.003,
    toolCallCount: 1,
    agentCallCount: 1,
    skillCallCount: 0,
  },
  {
    traceId: 'trace-mock-004',
    userId: 'user-mock-003',
    startedAt: '2026-05-24T08:40:00.000Z',
    completedAt: '2026-05-24T08:40:06.100Z',
    durationMs: 6100,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 8200,
    estimatedCostUsd: 0.0246,
    toolCallCount: 5,
    agentCallCount: 2,
    skillCallCount: 1,
  },
  {
    traceId: 'trace-mock-005',
    userId: 'user-mock-002',
    startedAt: '2026-05-24T08:30:22.000Z',
    completedAt: '2026-05-24T08:30:24.500Z',
    durationMs: 2500,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 3400,
    estimatedCostUsd: 0.0102,
    toolCallCount: 2,
    agentCallCount: 1,
    skillCallCount: 0,
  },
];

const MOCK_TRACE_DETAILS: Record<string, AdminTraceDetail> = {
  'trace-mock-001': {
    traceId: 'trace-mock-001',
    userId: 'user-mock-001',
    requestId: 'req-mock-001',
    threadId: 'thread-mock-001',
    startedAt: '2026-05-24T09:12:00.000Z',
    completedAt: '2026-05-24T09:12:02.340Z',
    durationMs: 2340,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 3120,
    estimatedCostUsd: 0.0094,
    toolCallCount: 3,
    agentCallCount: 1,
    skillCallCount: 0,
    tokenUsage: { inputTokens: 2480, outputTokens: 640, totalTokens: 3120 },
    agentCalls: [
      {
        agentName: 'GeneralAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T09:12:00.050Z',
        completedAt: '2026-05-24T09:12:02.300Z',
        durationMs: 2250,
        status: 'success',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-001-1',
        toolName: 'router',
        startedAt: '2026-05-24T09:12:00.100Z',
        completedAt: '2026-05-24T09:12:00.185Z',
        durationMs: 85,
        status: 'success',
      },
      {
        toolCallId: 'tc-001-2',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:12:00.200Z',
        completedAt: '2026-05-24T09:12:01.150Z',
        durationMs: 950,
        status: 'success',
      },
      {
        toolCallId: 'tc-001-3',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T09:12:01.200Z',
        completedAt: '2026-05-24T09:12:01.620Z',
        durationMs: 420,
        status: 'success',
      },
    ],
    skillCalls: [],
  },
  'trace-mock-002': {
    traceId: 'trace-mock-002',
    userId: 'user-mock-002',
    requestId: 'req-mock-002',
    threadId: 'thread-mock-002',
    startedAt: '2026-05-24T09:08:45.000Z',
    completedAt: '2026-05-24T09:08:47.800Z',
    durationMs: 2800,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 4850,
    estimatedCostUsd: 0.0146,
    toolCallCount: 2,
    agentCallCount: 1,
    skillCallCount: 1,
    tokenUsage: { inputTokens: 3600, outputTokens: 1250, totalTokens: 4850 },
    agentCalls: [
      {
        agentName: 'ManufacturingAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T09:08:45.050Z',
        completedAt: '2026-05-24T09:08:47.750Z',
        durationMs: 2700,
        status: 'success',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-002-1',
        toolName: 'router',
        startedAt: '2026-05-24T09:08:45.100Z',
        completedAt: '2026-05-24T09:08:45.185Z',
        durationMs: 85,
        status: 'success',
      },
      {
        toolCallId: 'tc-002-2',
        toolName: 'manufacturing_line',
        startedAt: '2026-05-24T09:08:45.200Z',
        completedAt: '2026-05-24T09:08:46.300Z',
        durationMs: 1100,
        status: 'success',
      },
    ],
    skillCalls: [
      {
        skillName: 'manufacturing_qa',
        durationMs: 3100,
        status: 'success',
      },
    ],
  },
  'trace-mock-003': {
    traceId: 'trace-mock-003',
    userId: 'user-mock-001',
    requestId: 'req-mock-003',
    threadId: 'thread-mock-001',
    startedAt: '2026-05-24T08:55:10.000Z',
    completedAt: '2026-05-24T08:55:11.200Z',
    durationMs: 1200,
    status: 'error',
    model: 'claude-sonnet-4-6',
    totalTokens: 980,
    estimatedCostUsd: 0.003,
    toolCallCount: 1,
    agentCallCount: 1,
    skillCallCount: 0,
    tokenUsage: { inputTokens: 820, outputTokens: 160, totalTokens: 980 },
    agentCalls: [
      {
        agentName: 'GeneralAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T08:55:10.050Z',
        completedAt: '2026-05-24T08:55:11.150Z',
        durationMs: 1100,
        status: 'error',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-003-1',
        toolName: 'web_research',
        startedAt: '2026-05-24T08:55:10.100Z',
        completedAt: '2026-05-24T08:55:11.100Z',
        durationMs: 1000,
        status: 'error',
        error: 'Search quota exceeded',
      },
    ],
    skillCalls: [],
  },
  'trace-mock-004': {
    traceId: 'trace-mock-004',
    userId: 'user-mock-003',
    requestId: 'req-mock-004',
    threadId: 'thread-mock-003',
    startedAt: '2026-05-24T08:40:00.000Z',
    completedAt: '2026-05-24T08:40:06.100Z',
    durationMs: 6100,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 8200,
    estimatedCostUsd: 0.0246,
    toolCallCount: 5,
    agentCallCount: 2,
    skillCallCount: 1,
    tokenUsage: { inputTokens: 6100, outputTokens: 2100, totalTokens: 8200 },
    agentCalls: [
      {
        agentName: 'GeneralAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T08:40:00.050Z',
        completedAt: '2026-05-24T08:40:03.000Z',
        durationMs: 2950,
        status: 'success',
      },
      {
        agentName: 'ManufacturingAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T08:40:03.100Z',
        completedAt: '2026-05-24T08:40:06.000Z',
        durationMs: 2900,
        status: 'success',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-004-1',
        toolName: 'router',
        startedAt: '2026-05-24T08:40:00.100Z',
        completedAt: '2026-05-24T08:40:00.185Z',
        durationMs: 85,
        status: 'success',
      },
      {
        toolCallId: 'tc-004-2',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T08:40:00.200Z',
        completedAt: '2026-05-24T08:40:00.620Z',
        durationMs: 420,
        status: 'success',
      },
      {
        toolCallId: 'tc-004-3',
        toolName: 'manufacturing_line',
        startedAt: '2026-05-24T08:40:03.200Z',
        completedAt: '2026-05-24T08:40:04.300Z',
        durationMs: 1100,
        status: 'success',
      },
      {
        toolCallId: 'tc-004-4',
        toolName: 'web_research',
        startedAt: '2026-05-24T08:40:04.400Z',
        completedAt: '2026-05-24T08:40:05.350Z',
        durationMs: 950,
        status: 'success',
      },
      {
        toolCallId: 'tc-004-5',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T08:40:05.400Z',
        completedAt: '2026-05-24T08:40:05.820Z',
        durationMs: 420,
        status: 'success',
      },
    ],
    skillCalls: [
      {
        skillName: 'manufacturing_qa',
        durationMs: 3100,
        status: 'success',
      },
    ],
  },
  'trace-mock-005': {
    traceId: 'trace-mock-005',
    userId: 'user-mock-002',
    requestId: 'req-mock-005',
    threadId: 'thread-mock-002',
    startedAt: '2026-05-24T08:30:22.000Z',
    completedAt: '2026-05-24T08:30:24.500Z',
    durationMs: 2500,
    status: 'success',
    model: 'claude-sonnet-4-6',
    totalTokens: 3400,
    estimatedCostUsd: 0.0102,
    toolCallCount: 2,
    agentCallCount: 1,
    skillCallCount: 0,
    tokenUsage: { inputTokens: 2600, outputTokens: 800, totalTokens: 3400 },
    agentCalls: [
      {
        agentName: 'GeneralAgent',
        agentKind: 'bedrock-inline',
        startedAt: '2026-05-24T08:30:22.050Z',
        completedAt: '2026-05-24T08:30:24.450Z',
        durationMs: 2400,
        status: 'success',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-005-1',
        toolName: 'router',
        startedAt: '2026-05-24T08:30:22.100Z',
        completedAt: '2026-05-24T08:30:22.185Z',
        durationMs: 85,
        status: 'success',
      },
      {
        toolCallId: 'tc-005-2',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T08:30:22.200Z',
        completedAt: '2026-05-24T08:30:22.620Z',
        durationMs: 420,
        status: 'success',
      },
    ],
    skillCalls: [],
  },
};

const FALLBACK_TRACE_DETAIL: AdminTraceDetail = MOCK_TRACE_DETAILS[
  'trace-mock-001'
] as AdminTraceDetail;

// ─────────────────────────────────────────────────────────────────────────────

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
  // Deck Workspace snapshot (Epic #423): grows the slide count over successive
  // polls so the live-preview polling UX is exercisable in mock mode.
  getGetDeckSnapshotMockHandler(({ params }): DeckSnapshotResponse => {
    return mockDeckSnapshot(String(params.deckId));
  }),
  // Serve the mock compose/defs assets the snapshot URLs point at, so the
  // renderer draws real (minimal) slides.
  http.get(DECK_MOCK_ASSET_PATTERN, ({ request }) => {
    const body = resolveDeckMockAsset(new URL(request.url).pathname);
    if (body === null) {
      return HttpResponse.json({ error: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json(body);
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
  getGetAdminOverviewMockHandler(() => ({
    requestCount: 42,
    activeUserCount: 8,
    totalTokens: 124_800,
    avgDurationMs: 2340,
    p95DurationMs: 6100,
    errorRate: 0.048,
    totalToolCalls: 187,
    toolFailureRate: 0.032,
    estimatedCostUsd: 0.374,
    period: {
      from: new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    },
  })),

  getGetAdminUsersMockHandler(() => ({
    users: [
      {
        userId: 'user-mock-001',
        displayName: '山田 太郎',
        email: 'yamada.taro@example.com',
        requestCount: 18,
        totalTokens: 56_000,
        avgDurationMs: 2100,
        errorRate: 0.0,
        mostUsedAgent: 'GeneralAgent',
        mostUsedTool: 'web_research',
      },
      {
        userId: 'user-mock-002',
        displayName: '佐藤 花子',
        email: 'sato.hanako@example.com',
        requestCount: 12,
        totalTokens: 34_200,
        avgDurationMs: 1800,
        errorRate: 0.083,
        mostUsedAgent: 'ManufacturingAgent',
        mostUsedTool: 'manufacturing_line',
      },
      {
        userId: 'user-mock-003',
        email: 'tanaka@example.com',
        requestCount: 7,
        totalTokens: 21_000,
        avgDurationMs: 2800,
        errorRate: 0.0,
        mostUsedAgent: 'GeneralAgent',
        mostUsedTool: 'kb_retrieve',
      },
      {
        userId: 'user-mock-004',
        displayName: 'Bob Smith',
        email: 'bob.smith@example.com',
        requestCount: 3,
        totalTokens: 8_100,
        avgDurationMs: 3200,
        errorRate: 0.333,
        mostUsedAgent: 'GeneralAgent',
        mostUsedTool: 'router',
      },
      {
        userId: 'user-mock-005',
        requestCount: 2,
        totalTokens: 5_500,
        avgDurationMs: 1900,
        errorRate: 0.0,
      },
    ],
  })),

  getListAdminUsersMockHandler(() => ({
    users: [
      {
        userId: 'user-mock-001',
        sub: 'sub-mock-001',
        email: 'user001@example.com',
        role: 'user' as const,
        enabled: true,
        createdAt: '2025-01-15T09:00:00Z',
      },
      {
        userId: 'user-mock-002',
        sub: 'sub-mock-002',
        email: 'user002@example.com',
        role: 'user' as const,
        enabled: true,
        createdAt: '2025-02-20T10:00:00Z',
      },
      {
        userId: 'user-mock-003',
        sub: 'sub-mock-003',
        email: 'admin@example.com',
        role: 'admin' as const,
        enabled: true,
        createdAt: '2024-12-01T08:00:00Z',
      },
    ],
  })),

  getGetAdminAgentsMockHandler(() => ({
    agents: [
      {
        agentName: 'GeneralAgent',
        callCount: 38,
        successRate: 0.921,
        errorRate: 0.079,
        avgDurationMs: 2200,
        totalTokens: 80_000,
        relatedTools: ['router', 'web_research', 'kb_retrieve'],
      },
      {
        agentName: 'ManufacturingAgent',
        callCount: 12,
        successRate: 1.0,
        errorRate: 0.0,
        avgDurationMs: 2800,
        totalTokens: 44_800,
        relatedTools: ['manufacturing_line', 'router'],
      },
    ],
  })),

  getGetAdminToolsMockHandler(() => ({
    tools: [
      {
        toolName: 'router',
        callCount: 187,
        failureRate: 0.016,
        avgDurationMs: 85,
      },
      {
        toolName: 'web_research',
        callCount: 95,
        failureRate: 0.063,
        avgDurationMs: 950,
        lastError: 'Search quota exceeded',
      },
      {
        toolName: 'kb_retrieve',
        callCount: 62,
        failureRate: 0.0,
        avgDurationMs: 420,
      },
      {
        toolName: 'manufacturing_line',
        callCount: 12,
        failureRate: 0.0,
        avgDurationMs: 1100,
      },
    ],
  })),

  getGetAdminSkillsMockHandler(() => ({
    skills: [
      {
        skillName: 'web_research',
        requestCount: 22,
        avgDurationMs: 1800,
        totalTokens: 4200,
        errorRate: 0.045,
      },
      {
        skillName: 'manufacturing_qa',
        requestCount: 8,
        avgDurationMs: 3100,
        totalTokens: 6500,
        errorRate: 0.0,
      },
    ],
  })),

  getGetAdminTracesMockHandler(({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? '';
    const userId = url.searchParams.get('userId') ?? '';

    const filtered = MOCK_TRACES.filter(
      (t) =>
        (status === '' || t.status === status) &&
        (userId === '' || t.userId.includes(userId) || t.traceId.includes(userId)),
    );

    return { traces: filtered };
  }),

  getGetAdminTimeseriesMockHandler(() => ({
    buckets: [
      {
        bucketStart: '2026-05-19T00:00:00.000Z',
        requestCount: 5,
        successCount: 5,
        errorCount: 0,
        cancelledCount: 0,
        avgDurationMs: 2100,
        p95DurationMs: 4200,
        totalTokens: 14_800,
        inputTokens: 11_200,
        outputTokens: 3_600,
        toolCallCount: 12,
        toolFailureCount: 0,
      },
      {
        bucketStart: '2026-05-20T00:00:00.000Z',
        requestCount: 8,
        successCount: 7,
        errorCount: 1,
        cancelledCount: 0,
        avgDurationMs: 2450,
        p95DurationMs: 5800,
        totalTokens: 23_500,
        inputTokens: 17_600,
        outputTokens: 5_900,
        toolCallCount: 19,
        toolFailureCount: 1,
      },
      {
        bucketStart: '2026-05-21T00:00:00.000Z',
        requestCount: 6,
        successCount: 5,
        errorCount: 0,
        cancelledCount: 1,
        avgDurationMs: 1900,
        p95DurationMs: 3800,
        totalTokens: 18_200,
        inputTokens: 13_700,
        outputTokens: 4_500,
        toolCallCount: 15,
        toolFailureCount: 0,
      },
      {
        bucketStart: '2026-05-22T00:00:00.000Z',
        requestCount: 11,
        successCount: 9,
        errorCount: 2,
        cancelledCount: 0,
        avgDurationMs: 2800,
        p95DurationMs: 6100,
        totalTokens: 34_100,
        inputTokens: 25_600,
        outputTokens: 8_500,
        toolCallCount: 28,
        toolFailureCount: 2,
      },
      {
        bucketStart: '2026-05-23T00:00:00.000Z',
        requestCount: 7,
        successCount: 7,
        errorCount: 0,
        cancelledCount: 0,
        avgDurationMs: 2200,
        p95DurationMs: 4900,
        totalTokens: 21_600,
        inputTokens: 16_200,
        outputTokens: 5_400,
        toolCallCount: 17,
        toolFailureCount: 0,
      },
      {
        bucketStart: '2026-05-24T00:00:00.000Z',
        requestCount: 5,
        successCount: 4,
        errorCount: 1,
        cancelledCount: 0,
        avgDurationMs: 2988,
        p95DurationMs: 6100,
        totalTokens: 20_550,
        inputTokens: 15_600,
        outputTokens: 4_950,
        toolCallCount: 13,
        toolFailureCount: 1,
      },
      {
        bucketStart: '2026-05-25T00:00:00.000Z',
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        cancelledCount: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        toolCallCount: 0,
        toolFailureCount: 0,
      },
    ],
    period: {
      from: new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    },
  })),

  getGetAdminTraceDetailMockHandler(({ params }) => {
    const traceId = String(params.traceId);
    const detail = MOCK_TRACE_DETAILS[traceId] ?? FALLBACK_TRACE_DETAIL;
    return { trace: detail };
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

    const { message, threadId, command } = parsed.data;
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

    const isSlideCommand =
      command?.type === 'create_slide_presentation' ||
      /^\/slide(\s|$)/i.test(message) ||
      /スライド|プレゼン/i.test(message);
    const artifactManifest = isSlideCommand ? buildMockArtifactManifest() : undefined;

    appendMessage({
      threadId: thread.threadId,
      role: 'assistant',
      content: reply,
      observabilitySummary,
      ...(artifactManifest ? { artifactManifest } : {}),
    });

    return JSON.stringify({
      threadId: thread.threadId,
      reply,
      model: 'msw-dummy-agent-v1',
      createdAt: now(),
      observabilitySummary,
      ...(artifactManifest ? { artifactManifest } : {}),
    });
  }),

  // ─── Knowledge-base handlers ─────────────────────────────────────────────────

  getGetKbStatusMockHandler(() => ({
    configured: true,
    kbId: 'MOCK-KB-001',
    dataSourceId: 'DS-MOCK-001',
    dataSourceBucketName: 'mock-agentra-kb-bucket',
  })),

  getListKbDocumentsMockHandler(() => ({ documents: kbDocumentList() })),

  getPresignKbDocumentMockHandler(async ({ request }) => {
    const body = await request.json().catch(() => null);
    const { fileName, sizeBytes } = (body ?? {}) as {
      fileName: string;
      sizeBytes: number;
    };
    const uploadId = uuidv7();
    const safeName = String(fileName ?? 'file').replace(/[/\\]/g, '_');
    const key = `manufacturing-line/${uploadId}-${safeName}`;
    pendingKbUploads.set(uploadId, {
      key,
      fileName: safeName,
      sizeBytes: Number(sizeBytes),
    });
    return {
      presignedUrl: `/mock-s3/kb-upload/${uploadId}`,
      key,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }),

  http.put('/mock-s3/kb-upload/:uploadId', ({ params }) => {
    const uploadId = String(params.uploadId);
    const pending = pendingKbUploads.get(uploadId);
    if (!pending) return new HttpResponse(null, { status: 404 });
    pendingKbUploads.delete(uploadId);
    kbDocumentStore.set(pending.key, {
      key: pending.key,
      name: pending.fileName,
      sizeBytes: pending.sizeBytes,
      lastModified: now(),
    });
    startMockIngestionJob();
    return new HttpResponse(null, { status: 200 });
  }),

  getDeleteKbDocumentMockHandler(({ request }) => {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? '';
    kbDocumentStore.delete(key);
    startMockIngestionJob();
  }),

  getListKbIngestionJobsMockHandler(() => ({ jobs: kbJobList() })),

  getStartKbSyncMockHandler(() => {
    const hasActive = Array.from(kbJobStore.values()).some(
      (j) => j.status === 'IN_PROGRESS' || j.status === 'STARTING',
    );
    if (hasActive) {
      throw HttpResponse.json(
        { error: 'An ingestion job is already in progress.' },
        { status: 409 },
      );
    }
    const jobId = uuidv7();
    kbJobStore.set(jobId, { jobId, status: 'STARTING', startedAt: now() });
    setTimeout(() => {
      const existing = kbJobStore.get(jobId);
      if (existing) {
        kbJobStore.set(jobId, { ...existing, status: 'COMPLETE', completedAt: now() });
      }
    }, 3_000);
    return { jobId, status: 'STARTING' as const };
  }),
];

function now() {
  return new Date().toISOString();
}

function kbDocumentList(): KbDocument[] {
  return Array.from(kbDocumentStore.values());
}

function kbJobList(): IngestionJobSummary[] {
  return Array.from(kbJobStore.values()).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

function startMockIngestionJob() {
  const jobId = uuidv7();
  kbJobStore.set(jobId, { jobId, status: 'IN_PROGRESS', startedAt: now() });
  setTimeout(() => {
    const existing = kbJobStore.get(jobId);
    if (existing) {
      kbJobStore.set(jobId, { ...existing, status: 'COMPLETE', completedAt: now() });
    }
  }, 3_000);
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

function buildMockArtifactManifest(): ArtifactManifest {
  return {
    id: uuidv7(),
    createdAt: now(),
    artifacts: [
      {
        id: uuidv7(),
        kind: 'pptx' as ArtifactRef['kind'],
        name: 'presentation.pptx',
        path: 'runs/mock/presentation.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: 1_234_567,
        createdAt: now(),
        exists: true,
      },
    ],
  };
}

function appendMessage(input: {
  threadId: string;
  role: MessageRole;
  content: string;
  observabilitySummary?: ChatObservationSummary;
  artifactManifest?: ArtifactManifest;
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
    ...(input.artifactManifest ? { artifactManifest: input.artifactManifest } : {}),
  };

  const currentMessages = messageStore.get(input.threadId) ?? [];
  messageStore.set(input.threadId, [...currentMessages, message]);

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
  const command =
    'command' in payload ? (payload.command as ChatCommand | undefined) : undefined;

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
      ...(command ? { command } : {}),
    } satisfies ChatRequest,
  };
}

function buildDummyObservabilitySummary(message?: string): ChatObservationSummary {
  const normalized = (message ?? '').toLowerCase();
  const ts = now();
  const start = new Date(Date.now() - 1400).toISOString();

  // empty tools scenario
  if (normalized.includes('空') || normalized.includes('empty tools')) {
    return {
      traceId: `mock-trace-${uuidv7()}`,
      startedAt: start,
      completedAt: ts,
      durationMs: 210,
      status: 'success',
      tokenUsage: { inputTokens: 420, outputTokens: 180, totalTokens: 600 },
      toolCalls: [],
      toolCallCount: 0,
      toolFailureCount: 0,
    };
  }

  // cancelled scenario
  if (normalized.includes('キャンセル') || normalized.includes('cancel')) {
    return {
      traceId: `mock-trace-${uuidv7()}`,
      startedAt: start,
      completedAt: ts,
      durationMs: 450,
      status: 'cancelled',
      toolCalls: [
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
          durationMs: 360,
          status: 'cancelled',
        },
      ],
      toolCallCount: 2,
      toolFailureCount: 0,
    };
  }

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
  } else if (normalized.includes('エージェント') || normalized.includes('agent')) {
    toolCalls.push(
      {
        toolCallId: 'tc-r',
        toolName: 'router',
        startedAt: start,
        durationMs: 100,
        status: 'success',
        metadata: { agentName: 'OrchestratorAgent', agentKind: 'orchestrator' },
      },
      {
        toolCallId: 'tc-s',
        toolName: 'search_knowledge_base',
        startedAt: start,
        durationMs: 680,
        status: 'success',
        metadata: { agentName: 'SearchAgent', agentKind: 'search' },
      },
      {
        toolCallId: 'tc-w',
        toolName: 'web_research',
        startedAt: start,
        durationMs: 920,
        status: 'success',
        metadata: { agentName: 'SearchAgent', agentKind: 'search' },
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

  // no tokenUsage scenario
  const includeTokenUsage = !(
    normalized.includes('トークン') || normalized.includes('no token')
  );

  return {
    traceId: `mock-trace-${uuidv7()}`,
    startedAt: start,
    completedAt: ts,
    durationMs: 1380,
    status: toolCalls.some((tc) => tc.status === 'error') ? 'error' : 'success',
    ...(includeTokenUsage
      ? { tokenUsage: { inputTokens: 1240, outputTokens: 380, totalTokens: 1620 } }
      : {}),
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

  // Second seed thread: observability variation scenarios for UI testing
  const thread2Id = 'thread-mock-002';
  const t2Created = '2026-04-18T01:00:00.000Z';

  threadStore.set(thread2Id, {
    threadId: thread2Id,
    title: 'Observability バリエーション',
    createdAt: t2Created,
    updatedAt: '2026-04-18T01:05:00.000Z',
    preview: 'observability popover の各シナリオを確認するためのスレッドです。',
  });

  messageStore.set(thread2Id, [
    {
      messageId: 'msg-v-001',
      threadId: thread2Id,
      role: 'user',
      content: '成功（ツール 0 件）のケースを見せてください',
      createdAt: '2026-04-18T01:01:00.000Z',
    },
    {
      messageId: 'msg-v-002',
      threadId: thread2Id,
      role: 'assistant',
      content: 'ツール呼び出しなしで応答できる場合のサマリーです。',
      createdAt: '2026-04-18T01:01:10.000Z',
      observabilitySummary: buildDummyObservabilitySummary('空'),
    },
    {
      messageId: 'msg-v-003',
      threadId: thread2Id,
      role: 'user',
      content: 'エージェント情報を含むケース',
      createdAt: '2026-04-18T01:02:00.000Z',
    },
    {
      messageId: 'msg-v-004',
      threadId: thread2Id,
      role: 'assistant',
      content: '複数エージェントが協調して回答を生成しました。',
      createdAt: '2026-04-18T01:02:20.000Z',
      observabilitySummary: buildDummyObservabilitySummary('エージェント'),
    },
    {
      messageId: 'msg-v-005',
      threadId: thread2Id,
      role: 'user',
      content: 'ツール失敗（エラー）のケース',
      createdAt: '2026-04-18T01:03:00.000Z',
    },
    {
      messageId: 'msg-v-006',
      threadId: thread2Id,
      role: 'assistant',
      content: '一部ツールが失敗しましたが、他の手段で回答しました。',
      createdAt: '2026-04-18T01:03:15.000Z',
      observabilitySummary: buildDummyObservabilitySummary('エラー'),
    },
    {
      messageId: 'msg-v-007',
      threadId: thread2Id,
      role: 'user',
      content: 'tokenUsage なしのケース（トークン情報が取れない場合）',
      createdAt: '2026-04-18T01:04:00.000Z',
    },
    {
      messageId: 'msg-v-008',
      threadId: thread2Id,
      role: 'assistant',
      content: 'トークン使用量が記録されていないモデルからの応答です。',
      createdAt: '2026-04-18T01:04:12.000Z',
      observabilitySummary: buildDummyObservabilitySummary('トークン'),
    },
  ]);

  // Third seed thread: error-handling UI state variations
  const thread3Id = 'thread-mock-003';

  threadStore.set(thread3Id, {
    threadId: thread3Id,
    title: 'エラーハンドリング バリエーション',
    createdAt: '2026-04-18T02:00:00.000Z',
    updatedAt: '2026-04-18T02:07:00.000Z',
    preview: 'error badge / cancelled badge / warning banner の確認用スレッドです。',
  });

  messageStore.set(thread3Id, [
    // 1. Normal message (control — no badge, no banner)
    {
      messageId: 'msg-e-001',
      threadId: thread3Id,
      role: 'user',
      content: '通常応答のケースを見せてください',
      createdAt: '2026-04-18T02:01:00.000Z',
    },
    {
      messageId: 'msg-e-002',
      threadId: thread3Id,
      role: 'assistant',
      content: 'ツール呼び出しを含む通常の応答です。エラーも中断もありません。',
      createdAt: '2026-04-18T02:01:10.000Z',
      observabilitySummary: observabilityFixtures.successWithTools,
    },

    // 2. Persisted errorMessage → red error badge + 再送信 button
    {
      messageId: 'msg-e-003',
      threadId: thread3Id,
      role: 'user',
      content: '生成エラーが記録されたケースを見せてください',
      createdAt: '2026-04-18T02:02:00.000Z',
    },
    {
      messageId: 'msg-e-004',
      threadId: thread3Id,
      role: 'assistant',
      content: '',
      createdAt: '2026-04-18T02:02:05.000Z',
      errorMessage:
        'AgentCore invocation failed after 3 retries.\nCaused by: ThrottlingException: Rate limit exceeded for model claude-3-5-sonnet.',
    },

    // 3. Persisted cancelledAt → muted cancelled badge
    {
      messageId: 'msg-e-005',
      threadId: thread3Id,
      role: 'user',
      content: 'ユーザーが中断したケースを見せてください',
      createdAt: '2026-04-18T02:03:00.000Z',
    },
    {
      messageId: 'msg-e-006',
      threadId: thread3Id,
      role: 'assistant',
      content: '途中まで生成された内容です...',
      createdAt: '2026-04-18T02:03:05.000Z',
      cancelledAt: '2026-04-18T02:03:08.000Z',
    },

    // 4. toolFailureCount > 0 with no errorMessage → amber warning banner only
    {
      messageId: 'msg-e-007',
      threadId: thread3Id,
      role: 'user',
      content: 'ツール失敗（警告バナーのみ）のケースを見せてください',
      createdAt: '2026-04-18T02:04:00.000Z',
    },
    {
      messageId: 'msg-e-008',
      threadId: thread3Id,
      role: 'assistant',
      content: '一部のツールが失敗しましたが、他の手段で回答を生成できました。',
      createdAt: '2026-04-18T02:04:15.000Z',
      observabilitySummary: observabilityFixtures.withToolFailure,
    },

    // 5. errorMessage + toolFailureCount > 0 → red badge + amber banner combined
    {
      messageId: 'msg-e-009',
      threadId: thread3Id,
      role: 'user',
      content: 'エラーバッジと警告バナーが両方出るケースを見せてください',
      createdAt: '2026-04-18T02:05:00.000Z',
    },
    {
      messageId: 'msg-e-010',
      threadId: thread3Id,
      role: 'assistant',
      content: '',
      createdAt: '2026-04-18T02:05:05.000Z',
      errorMessage:
        'ツール失敗後に AgentCore が終了しました。応答を完成できませんでした。',
      observabilitySummary: observabilityFixtures.withToolFailure,
    },

    // 6. Failed tool call — observability popover shows red-styled failed tool
    {
      messageId: 'msg-e-011',
      threadId: thread3Id,
      role: 'user',
      content: 'observability ポップオーバーで失敗ツールを確認したい',
      createdAt: '2026-04-18T02:06:00.000Z',
    },
    {
      messageId: 'msg-e-012',
      threadId: thread3Id,
      role: 'assistant',
      content: 'ツール実行が失敗しており、observability に詳細が記録されています。',
      createdAt: '2026-04-18T02:06:10.000Z',
      observabilitySummary: observabilityFixtures.errorStatus,
    },

    // 7. Cancelled tool call — observability popover shows cancelled tool status
    {
      messageId: 'msg-e-013',
      threadId: thread3Id,
      role: 'user',
      content: 'observability ポップオーバーでキャンセルされたツールを確認したい',
      createdAt: '2026-04-18T02:07:00.000Z',
    },
    {
      messageId: 'msg-e-014',
      threadId: thread3Id,
      role: 'assistant',
      content:
        'ツール実行がキャンセルされており、observability に状態が記録されています。',
      createdAt: '2026-04-18T02:07:10.000Z',
      observabilitySummary: observabilityFixtures.cancelledStatus,
    },
  ]);
}

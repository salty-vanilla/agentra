import type { ChatObservationSummary } from '@agentra/shared';

const BASE_TIME = {
  startedAt: '2026-05-24T09:00:00.000Z',
  completedAt: '2026-05-24T09:00:01.380Z',
};

export const observabilityFixtures = {
  successNoTools: {
    traceId: 'trace-fixture-no-tools',
    ...BASE_TIME,
    durationMs: 210,
    status: 'success',
    tokenUsage: { inputTokens: 420, outputTokens: 180, totalTokens: 600 },
    toolCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
  } satisfies ChatObservationSummary,

  successWithTools: {
    traceId: 'trace-fixture-with-tools',
    ...BASE_TIME,
    durationMs: 1380,
    status: 'success',
    tokenUsage: { inputTokens: 1240, outputTokens: 380, totalTokens: 1620 },
    toolCalls: [
      {
        toolCallId: 'tc-fix-001',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.160Z',
        durationMs: 110,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-002',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:00:00.200Z',
        completedAt: '2026-05-24T09:00:01.070Z',
        durationMs: 870,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-003',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T09:00:01.100Z',
        completedAt: '2026-05-24T09:00:01.520Z',
        durationMs: 420,
        status: 'success',
      },
    ],
    toolCallCount: 3,
    toolFailureCount: 0,
  } satisfies ChatObservationSummary,

  withToolFailure: {
    traceId: 'trace-fixture-tool-failure',
    ...BASE_TIME,
    durationMs: 1200,
    status: 'success',
    tokenUsage: { inputTokens: 980, outputTokens: 260, totalTokens: 1240 },
    toolCalls: [
      {
        toolCallId: 'tc-fix-004',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.140Z',
        durationMs: 90,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-005',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:00:00.200Z',
        completedAt: '2026-05-24T09:00:00.500Z',
        durationMs: 300,
        status: 'error',
        error: 'Search quota exceeded',
      },
      {
        toolCallId: 'tc-fix-006',
        toolName: 'kb_retrieve',
        startedAt: '2026-05-24T09:00:00.600Z',
        completedAt: '2026-05-24T09:00:01.020Z',
        durationMs: 420,
        status: 'success',
      },
    ],
    toolCallCount: 3,
    toolFailureCount: 1,
  } satisfies ChatObservationSummary,

  tokenUsageMissing: {
    traceId: 'trace-fixture-no-tokens',
    ...BASE_TIME,
    durationMs: 950,
    status: 'success',
    toolCalls: [
      {
        toolCallId: 'tc-fix-007',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.950Z',
        durationMs: 900,
        status: 'success',
      },
    ],
    toolCallCount: 1,
    toolFailureCount: 0,
  } satisfies ChatObservationSummary,

  withAgentMetadata: {
    traceId: 'trace-fixture-agents',
    ...BASE_TIME,
    durationMs: 1700,
    status: 'success',
    tokenUsage: { inputTokens: 1600, outputTokens: 520, totalTokens: 2120 },
    toolCalls: [
      {
        toolCallId: 'tc-fix-008',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.150Z',
        durationMs: 100,
        status: 'success',
        metadata: { agentName: 'OrchestratorAgent', agentKind: 'orchestrator' },
      },
      {
        toolCallId: 'tc-fix-009',
        toolName: 'search_knowledge_base',
        startedAt: '2026-05-24T09:00:00.200Z',
        completedAt: '2026-05-24T09:00:00.880Z',
        durationMs: 680,
        status: 'success',
        metadata: { agentName: 'SearchAgent', agentKind: 'search' },
      },
      {
        toolCallId: 'tc-fix-010',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:00:00.900Z',
        completedAt: '2026-05-24T09:00:01.820Z',
        durationMs: 920,
        status: 'success',
        metadata: { agentName: 'SearchAgent', agentKind: 'search' },
      },
    ],
    toolCallCount: 3,
    toolFailureCount: 0,
  } satisfies ChatObservationSummary,

  longToolName: {
    traceId: 'trace-fixture-long-name',
    ...BASE_TIME,
    durationMs: 2100,
    status: 'success',
    tokenUsage: { inputTokens: 1800, outputTokens: 600, totalTokens: 2400 },
    toolCalls: [
      {
        toolCallId: 'tc-fix-011',
        toolName:
          'very_long_tool_name_for_overflow_testing_structured_rag_retrieval_pipeline',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:01.250Z',
        durationMs: 1200,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-012',
        toolName:
          'another_extremely_long_tool_identifier_exceeding_typical_display_width',
        startedAt: '2026-05-24T09:00:01.300Z',
        completedAt: '2026-05-24T09:00:02.200Z',
        durationMs: 900,
        status: 'error',
        error: 'ツール実行タイムアウト: 制限時間 900ms を超過しました',
      },
    ],
    toolCallCount: 2,
    toolFailureCount: 1,
  } satisfies ChatObservationSummary,

  errorStatus: {
    traceId: 'trace-fixture-error',
    ...BASE_TIME,
    durationMs: 450,
    status: 'error',
    toolCalls: [
      {
        toolCallId: 'tc-fix-013',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.140Z',
        durationMs: 90,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-014',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:00:00.200Z',
        completedAt: '2026-05-24T09:00:00.560Z',
        durationMs: 360,
        status: 'error',
        error: '検索サービスが利用不可の状態です',
      },
    ],
    toolCallCount: 2,
    toolFailureCount: 1,
  } satisfies ChatObservationSummary,

  cancelledStatus: {
    traceId: 'trace-fixture-cancelled',
    ...BASE_TIME,
    durationMs: 380,
    status: 'cancelled',
    toolCalls: [
      {
        toolCallId: 'tc-fix-015',
        toolName: 'router',
        startedAt: '2026-05-24T09:00:00.050Z',
        completedAt: '2026-05-24T09:00:00.140Z',
        durationMs: 90,
        status: 'success',
      },
      {
        toolCallId: 'tc-fix-016',
        toolName: 'web_research',
        startedAt: '2026-05-24T09:00:00.200Z',
        durationMs: 290,
        status: 'cancelled',
      },
    ],
    toolCallCount: 2,
    toolFailureCount: 0,
  } satisfies ChatObservationSummary,
} as const;

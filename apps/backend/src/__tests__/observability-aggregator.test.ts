import type { ObservabilityRecord } from '@agentra/shared';
import { describe, expect, it } from 'vitest';
import {
  aggregateByAgent,
  aggregateBySkill,
  aggregateByTool,
  aggregateByUser,
  aggregateOverview,
  toTraceDetail,
  toTraceListItem,
} from '../lib/observability-aggregator.js';

function makeRecord(overrides: Partial<ObservabilityRecord> = {}): ObservabilityRecord {
  return {
    traceId: 'trace-001',
    requestId: 'req-001',
    threadId: 'thread-001',
    userId: 'user-001',
    startedAt: '2026-05-23T10:00:00.000Z',
    completedAt: '2026-05-23T10:00:05.000Z',
    durationMs: 5000,
    status: 'success',
    toolCalls: [],
    agentCalls: [],
    skillCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    createdAt: '2026-05-23T10:00:05.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

describe('aggregateOverview', () => {
  const period = { from: '2026-05-23', to: '2026-05-23' };

  it('returns zero stats for empty records', () => {
    const result = aggregateOverview([], period);
    expect(result.requestCount).toBe(0);
    expect(result.activeUserCount).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.avgDurationMs).toBe(0);
    expect(result.p95DurationMs).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.totalToolCalls).toBe(0);
    expect(result.toolFailureRate).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.period).toEqual(period);
  });

  it('counts requests and unique users', () => {
    const records = [
      makeRecord({ traceId: 't1', userId: 'user-A' }),
      makeRecord({ traceId: 't2', userId: 'user-A' }),
      makeRecord({ traceId: 't3', userId: 'user-B' }),
    ];
    const result = aggregateOverview(records, period);
    expect(result.requestCount).toBe(3);
    expect(result.activeUserCount).toBe(2);
  });

  it('calculates avg duration correctly', () => {
    const records = [
      makeRecord({ traceId: 't1', durationMs: 1000 }),
      makeRecord({ traceId: 't2', durationMs: 3000 }),
    ];
    const result = aggregateOverview(records, period);
    expect(result.avgDurationMs).toBe(2000);
  });

  it('calculates p95 duration on single record', () => {
    const records = [makeRecord({ traceId: 't1', durationMs: 1234 })];
    const result = aggregateOverview(records, period);
    expect(result.p95DurationMs).toBe(1234);
  });

  it('calculates p95 duration correctly for multiple records', () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({ traceId: `t${i}`, durationMs: (i + 1) * 100 }),
    );
    const result = aggregateOverview(records, period);
    // p95 index = floor(0.95 * 20) = 19, value = 2000
    expect(result.p95DurationMs).toBe(2000);
  });

  it('calculates error rate', () => {
    const records = [
      makeRecord({ traceId: 't1', status: 'success' }),
      makeRecord({ traceId: 't2', status: 'error' }),
      makeRecord({ traceId: 't3', status: 'error' }),
      makeRecord({ traceId: 't4', status: 'success' }),
    ];
    const result = aggregateOverview(records, period);
    expect(result.errorRate).toBeCloseTo(0.5);
  });

  it('sums total tokens and tool calls', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        toolCallCount: 3,
        toolFailureCount: 1,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
      makeRecord({
        traceId: 't2',
        toolCallCount: 2,
        toolFailureCount: 0,
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    ];
    const result = aggregateOverview(records, period);
    expect(result.totalTokens).toBe(450);
    expect(result.totalToolCalls).toBe(5);
    expect(result.toolFailureRate).toBeCloseTo(1 / 5);
  });

  it('sums estimated cost', () => {
    const records = [
      makeRecord({ traceId: 't1', estimatedCostUsd: 0.001 }),
      makeRecord({ traceId: 't2', estimatedCostUsd: 0.002 }),
    ];
    const result = aggregateOverview(records, period);
    expect(result.estimatedCostUsd).toBeCloseTo(0.003);
  });
});

describe('aggregateByUser', () => {
  it('groups records by userId', () => {
    const records = [
      makeRecord({ traceId: 't1', userId: 'user-A' }),
      makeRecord({ traceId: 't2', userId: 'user-A' }),
      makeRecord({ traceId: 't3', userId: 'user-B' }),
    ];
    const result = aggregateByUser(records);
    expect(result).toHaveLength(2);
    const userA = result.find((u) => u.userId === 'user-A');
    expect(userA?.requestCount).toBe(2);
    const userB = result.find((u) => u.userId === 'user-B');
    expect(userB?.requestCount).toBe(1);
  });

  it('calculates error rate per user', () => {
    const records = [
      makeRecord({ traceId: 't1', userId: 'u1', status: 'error' }),
      makeRecord({ traceId: 't2', userId: 'u1', status: 'success' }),
    ];
    const result = aggregateByUser(records);
    const user = result.find((u) => u.userId === 'u1');
    expect(user?.errorRate).toBeCloseTo(0.5);
  });

  it('identifies mostUsedAgent from agentCalls', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        userId: 'u1',
        agentCalls: [{ agentName: 'AgentAlpha' }, { agentName: 'AgentBeta' }],
      }),
      makeRecord({
        traceId: 't2',
        userId: 'u1',
        agentCalls: [{ agentName: 'AgentAlpha' }],
      }),
    ];
    const result = aggregateByUser(records);
    const user = result.find((u) => u.userId === 'u1');
    expect(user?.mostUsedAgent).toBe('AgentAlpha');
  });

  it('identifies mostUsedTool from toolCalls', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        userId: 'u1',
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'search',
            startedAt: '2026-05-23T10:00:00.000Z',
            durationMs: 100,
            status: 'success',
          },
          {
            toolCallId: 'tc2',
            toolName: 'calculator',
            startedAt: '2026-05-23T10:00:01.000Z',
            durationMs: 50,
            status: 'success',
          },
        ],
      }),
      makeRecord({
        traceId: 't2',
        userId: 'u1',
        toolCalls: [
          {
            toolCallId: 'tc3',
            toolName: 'search',
            startedAt: '2026-05-23T10:00:02.000Z',
            durationMs: 100,
            status: 'success',
          },
        ],
      }),
    ];
    const result = aggregateByUser(records);
    const user = result.find((u) => u.userId === 'u1');
    expect(user?.mostUsedTool).toBe('search');
  });

  it('returns undefined for mostUsedAgent when no agent calls', () => {
    const result = aggregateByUser([
      makeRecord({ traceId: 't1', userId: 'u1', agentCalls: [] }),
    ]);
    expect(result[0]?.mostUsedAgent).toBeUndefined();
  });

  it('returns empty array for empty input', () => {
    expect(aggregateByUser([])).toHaveLength(0);
  });
});

describe('aggregateByAgent', () => {
  it('groups agent calls by agentName', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        agentCalls: [
          { agentName: 'AgentA', status: 'success', durationMs: 1000 },
          { agentName: 'AgentB', status: 'error', durationMs: 500 },
        ],
      }),
      makeRecord({
        traceId: 't2',
        agentCalls: [{ agentName: 'AgentA', status: 'success', durationMs: 2000 }],
      }),
    ];
    const result = aggregateByAgent(records);
    const agentA = result.find((a) => a.agentName === 'AgentA');
    expect(agentA?.callCount).toBe(2);
    expect(agentA?.errorRate).toBe(0);
    expect(agentA?.avgDurationMs).toBe(1500);
  });

  it('calculates error rate for agents', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        agentCalls: [
          { agentName: 'Agent1', status: 'success', durationMs: 100 },
          { agentName: 'Agent1', status: 'error', durationMs: 200 },
        ],
      }),
    ];
    const result = aggregateByAgent(records);
    const agent = result.find((a) => a.agentName === 'Agent1');
    expect(agent?.errorRate).toBeCloseTo(0.5);
    expect(agent?.successRate).toBeCloseTo(0.5);
  });

  it('collects relatedTools as distinct tool names from same records', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        agentCalls: [{ agentName: 'AgentX', durationMs: 100 }],
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'toolA',
            startedAt: '2026-05-23T10:00:00.000Z',
            durationMs: 50,
            status: 'success',
          },
          {
            toolCallId: 'tc2',
            toolName: 'toolA',
            startedAt: '2026-05-23T10:00:01.000Z',
            durationMs: 50,
            status: 'success',
          },
          {
            toolCallId: 'tc3',
            toolName: 'toolB',
            startedAt: '2026-05-23T10:00:02.000Z',
            durationMs: 50,
            status: 'success',
          },
        ],
      }),
    ];
    const result = aggregateByAgent(records);
    const agent = result.find((a) => a.agentName === 'AgentX');
    expect(agent?.relatedTools).toHaveLength(2);
    expect(agent?.relatedTools).toContain('toolA');
    expect(agent?.relatedTools).toContain('toolB');
  });

  it('returns empty array for records with no agent calls', () => {
    const result = aggregateByAgent([makeRecord({ traceId: 't1', agentCalls: [] })]);
    expect(result).toHaveLength(0);
  });
});

describe('aggregateByTool', () => {
  it('groups tool calls by toolName', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'search',
            startedAt: '2026-05-23T10:00:00.000Z',
            durationMs: 100,
            status: 'success',
          },
          {
            toolCallId: 'tc2',
            toolName: 'calc',
            startedAt: '2026-05-23T10:00:01.000Z',
            durationMs: 50,
            status: 'success',
          },
        ],
      }),
      makeRecord({
        traceId: 't2',
        toolCalls: [
          {
            toolCallId: 'tc3',
            toolName: 'search',
            startedAt: '2026-05-23T10:00:02.000Z',
            durationMs: 200,
            status: 'error',
            error: 'timeout',
          },
        ],
      }),
    ];
    const result = aggregateByTool(records);
    const search = result.find((t) => t.toolName === 'search');
    expect(search?.callCount).toBe(2);
    expect(search?.failureRate).toBeCloseTo(0.5);
    expect(search?.avgDurationMs).toBe(150);
    expect(search?.lastError).toBe('timeout');
  });

  it('returns undefined for lastError when no failures', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        toolCalls: [
          {
            toolCallId: 'tc1',
            toolName: 'search',
            startedAt: '2026-05-23T10:00:00.000Z',
            durationMs: 100,
            status: 'success',
          },
        ],
      }),
    ];
    const result = aggregateByTool(records);
    expect(result[0]?.lastError).toBeUndefined();
  });

  it('returns empty array for records with no tool calls', () => {
    const result = aggregateByTool([makeRecord({ traceId: 't1', toolCalls: [] })]);
    expect(result).toHaveLength(0);
  });
});

describe('aggregateBySkill', () => {
  it('groups skill calls by skillName', () => {
    const records = [
      makeRecord({
        traceId: 't1',
        skillCalls: [{ skillName: 'web_research', durationMs: 1000, status: 'success' }],
        skillCallCount: 1,
      }),
      makeRecord({
        traceId: 't2',
        skillCalls: [{ skillName: 'web_research', durationMs: 2000, status: 'error' }],
        skillCallCount: 1,
      }),
    ];
    const result = aggregateBySkill(records);
    const skill = result.find((s) => s.skillName === 'web_research');
    expect(skill?.requestCount).toBe(2);
    expect(skill?.errorRate).toBeCloseTo(0.5);
    expect(skill?.avgDurationMs).toBe(1500);
  });

  it('returns empty array for records with no skill calls', () => {
    const result = aggregateBySkill([makeRecord({ traceId: 't1', skillCalls: [] })]);
    expect(result).toHaveLength(0);
  });
});

describe('toTraceListItem', () => {
  it('maps fields correctly', () => {
    const record = makeRecord({
      traceId: 'trace-xyz',
      userId: 'user-abc',
      status: 'error',
      toolCallCount: 3,
      agentCallCount: 1,
      skillCallCount: 2,
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      estimatedCostUsd: 0.001,
      model: 'claude-sonnet',
    });
    const item = toTraceListItem(record);
    expect(item.traceId).toBe('trace-xyz');
    expect(item.userId).toBe('user-abc');
    expect(item.status).toBe('error');
    expect(item.toolCallCount).toBe(3);
    expect(item.agentCallCount).toBe(1);
    expect(item.skillCallCount).toBe(2);
    expect(item.totalTokens).toBe(150);
    expect(item.estimatedCostUsd).toBe(0.001);
    expect(item.model).toBe('claude-sonnet');
  });

  it('returns undefined totalTokens when no tokenUsage', () => {
    const item = toTraceListItem(makeRecord({ traceId: 't1' }));
    expect(item.totalTokens).toBeUndefined();
    expect(item.estimatedCostUsd).toBeUndefined();
  });
});

describe('toTraceDetail', () => {
  it('includes all TraceListItem fields plus requestId, threadId, sub-call arrays, tokenUsage', () => {
    const toolCall = {
      toolCallId: 'tc1',
      toolName: 'search',
      startedAt: '2026-05-23T10:00:00.000Z',
      durationMs: 100,
      status: 'success' as const,
    };
    const record = makeRecord({
      traceId: 't1',
      requestId: 'req-xyz',
      threadId: 'thread-xyz',
      toolCalls: [toolCall],
      agentCalls: [{ agentName: 'AgentA', durationMs: 200, status: 'success' }],
      skillCalls: [{ skillName: 'web_research', durationMs: 300, status: 'success' }],
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const detail = toTraceDetail(record);
    expect(detail.requestId).toBe('req-xyz');
    expect(detail.threadId).toBe('thread-xyz');
    expect(detail.toolCalls).toHaveLength(1);
    expect(detail.toolCalls[0]?.toolName).toBe('search');
    expect(detail.agentCalls).toHaveLength(1);
    expect(detail.skillCalls).toHaveLength(1);
    expect(detail.tokenUsage?.totalTokens).toBe(150);
  });

  it('returns undefined tokenUsage when absent', () => {
    const detail = toTraceDetail(makeRecord({ traceId: 't1' }));
    expect(detail.tokenUsage).toBeUndefined();
  });
});

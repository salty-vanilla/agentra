import type { ObservabilityRecord } from '@agentra/shared';

// ── Output types ──────────────────────────────────────────────────────────────

export type OverviewStats = {
  requestCount: number;
  activeUserCount: number;
  totalTokens: number;
  avgDurationMs: number;
  p95DurationMs: number;
  errorRate: number;
  totalToolCalls: number;
  toolFailureRate: number;
  estimatedCostUsd: number;
  period: { from: string; to: string };
};

export type UserStats = {
  userId: string;
  requestCount: number;
  totalTokens: number;
  avgDurationMs: number;
  errorRate: number;
  mostUsedAgent?: string;
  mostUsedTool?: string;
};

export type AgentStats = {
  agentName: string;
  callCount: number;
  successRate: number;
  errorRate: number;
  avgDurationMs: number;
  totalTokens: number;
  relatedTools: string[];
};

export type ToolStats = {
  toolName: string;
  callCount: number;
  failureRate: number;
  avgDurationMs: number;
  lastError?: string;
};

export type SkillStats = {
  skillName: string;
  requestCount: number;
  avgDurationMs: number;
  totalTokens: number;
  errorRate: number;
};

export type TraceListItem = {
  traceId: string;
  userId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'error' | 'cancelled';
  model?: string;
  totalTokens?: number;
  estimatedCostUsd?: number;
  toolCallCount: number;
  agentCallCount: number;
  skillCallCount: number;
};

export type TraceDetail = TraceListItem & {
  requestId: string;
  threadId: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    status: 'success' | 'error' | 'cancelled';
    error?: string;
  }>;
  agentCalls: Array<{
    agentName: string;
    agentKind?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    status?: 'success' | 'error' | 'cancelled';
  }>;
  skillCalls: Array<{
    skillName: string;
    durationMs?: number;
    status?: 'success' | 'error' | 'cancelled';
  }>;
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * sorted.length);
  return sorted[idx] ?? sorted[sorted.length - 1] ?? 0;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function topByCount(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best;
}

// ── Aggregation functions ─────────────────────────────────────────────────────

export function aggregateOverview(
  records: ObservabilityRecord[],
  period: { from: string; to: string },
): OverviewStats {
  if (records.length === 0) {
    return {
      requestCount: 0,
      activeUserCount: 0,
      totalTokens: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      errorRate: 0,
      totalToolCalls: 0,
      toolFailureRate: 0,
      estimatedCostUsd: 0,
      period,
    };
  }

  const userIds = new Set(records.map((r) => r.userId));
  const durations = records.map((r) => r.durationMs);
  const totalTokens = records.reduce(
    (sum, r) => sum + (r.tokenUsage?.totalTokens ?? 0),
    0,
  );
  const errorCount = records.filter((r) => r.status === 'error').length;
  const totalToolCalls = records.reduce((sum, r) => sum + r.toolCallCount, 0);
  const totalToolFailures = records.reduce((sum, r) => sum + r.toolFailureCount, 0);
  const estimatedCostUsd = records.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);

  return {
    requestCount: records.length,
    activeUserCount: userIds.size,
    totalTokens,
    avgDurationMs: Math.round(avg(durations)),
    p95DurationMs: p95(durations),
    errorRate: errorCount / records.length,
    totalToolCalls,
    toolFailureRate: totalToolCalls === 0 ? 0 : totalToolFailures / totalToolCalls,
    estimatedCostUsd,
    period,
  };
}

export function aggregateByUser(records: ObservabilityRecord[]): UserStats[] {
  const byUser = new Map<string, ObservabilityRecord[]>();
  for (const record of records) {
    const existing = byUser.get(record.userId) ?? [];
    byUser.set(record.userId, [...existing, record]);
  }

  return Array.from(byUser.entries()).map(([userId, userRecords]) => {
    const errorCount = userRecords.filter((r) => r.status === 'error').length;
    const totalTokens = userRecords.reduce(
      (sum, r) => sum + (r.tokenUsage?.totalTokens ?? 0),
      0,
    );
    const durations = userRecords.map((r) => r.durationMs);

    const agentCounts = new Map<string, number>();
    const toolCounts = new Map<string, number>();

    for (const r of userRecords) {
      for (const a of r.agentCalls) {
        agentCounts.set(a.agentName, (agentCounts.get(a.agentName) ?? 0) + 1);
      }
      for (const t of r.toolCalls) {
        toolCounts.set(t.toolName, (toolCounts.get(t.toolName) ?? 0) + 1);
      }
    }

    const mostUsedAgent = topByCount(agentCounts);
    const mostUsedTool = topByCount(toolCounts);
    return {
      userId,
      requestCount: userRecords.length,
      totalTokens,
      avgDurationMs: Math.round(avg(durations)),
      errorRate: userRecords.length === 0 ? 0 : errorCount / userRecords.length,
      ...(mostUsedAgent !== null ? { mostUsedAgent } : {}),
      ...(mostUsedTool !== null ? { mostUsedTool } : {}),
    };
  });
}

export function aggregateByAgent(records: ObservabilityRecord[]): AgentStats[] {
  type AgentAccum = {
    durations: number[];
    successCount: number;
    errorCount: number;
    totalTokens: number;
    relatedToolNames: Set<string>;
  };

  const byAgent = new Map<string, AgentAccum>();

  for (const record of records) {
    if (record.agentCalls.length === 0) continue;

    const recordToolNames = new Set(record.toolCalls.map((t) => t.toolName));

    for (const call of record.agentCalls) {
      const existing = byAgent.get(call.agentName) ?? {
        durations: [],
        successCount: 0,
        errorCount: 0,
        totalTokens: 0,
        relatedToolNames: new Set<string>(),
      };

      const durations =
        call.durationMs != null
          ? [...existing.durations, call.durationMs]
          : existing.durations;
      const successCount =
        call.status === 'success' ? existing.successCount + 1 : existing.successCount;
      const errorCount =
        call.status === 'error' ? existing.errorCount + 1 : existing.errorCount;
      const totalTokens = existing.totalTokens + (record.tokenUsage?.totalTokens ?? 0);
      const relatedToolNames = new Set([
        ...existing.relatedToolNames,
        ...recordToolNames,
      ]);

      byAgent.set(call.agentName, {
        durations,
        successCount,
        errorCount,
        totalTokens,
        relatedToolNames,
      });
    }
  }

  return Array.from(byAgent.entries()).map(([agentName, accum]) => {
    const callCount = accum.successCount + accum.errorCount;
    return {
      agentName,
      callCount,
      successRate: callCount === 0 ? 0 : accum.successCount / callCount,
      errorRate: callCount === 0 ? 0 : accum.errorCount / callCount,
      avgDurationMs: Math.round(avg(accum.durations)),
      totalTokens: accum.totalTokens,
      relatedTools: Array.from(accum.relatedToolNames),
    };
  });
}

export function aggregateByTool(records: ObservabilityRecord[]): ToolStats[] {
  type ToolAccum = {
    durations: number[];
    failureCount: number;
    lastError: { startedAt: string; error: string } | null;
    totalCount: number;
  };

  const byTool = new Map<string, ToolAccum>();

  for (const record of records) {
    for (const call of record.toolCalls) {
      const existing = byTool.get(call.toolName) ?? {
        durations: [],
        failureCount: 0,
        lastError: null,
        totalCount: 0,
      };

      const isFailure = call.status === 'error' || call.status === 'cancelled';
      const failureCount = isFailure ? existing.failureCount + 1 : existing.failureCount;

      let lastError = existing.lastError;
      if (isFailure && call.error) {
        if (!lastError || call.startedAt > lastError.startedAt) {
          lastError = { startedAt: call.startedAt, error: call.error };
        }
      }

      byTool.set(call.toolName, {
        durations: [...existing.durations, call.durationMs],
        failureCount,
        lastError,
        totalCount: existing.totalCount + 1,
      });
    }
  }

  return Array.from(byTool.entries()).map(([toolName, accum]) => ({
    toolName,
    callCount: accum.totalCount,
    failureRate: accum.totalCount === 0 ? 0 : accum.failureCount / accum.totalCount,
    avgDurationMs: Math.round(avg(accum.durations)),
    ...(accum.lastError ? { lastError: accum.lastError.error } : {}),
  }));
}

export function aggregateBySkill(records: ObservabilityRecord[]): SkillStats[] {
  type SkillAccum = {
    durations: number[];
    errorCount: number;
    totalCount: number;
    totalTokens: number;
  };

  const bySkill = new Map<string, SkillAccum>();

  for (const record of records) {
    const tokenPerSkill =
      record.skillCallCount > 0
        ? Math.round((record.tokenUsage?.totalTokens ?? 0) / record.skillCallCount)
        : 0;

    for (const call of record.skillCalls) {
      const existing = bySkill.get(call.skillName) ?? {
        durations: [],
        errorCount: 0,
        totalCount: 0,
        totalTokens: 0,
      };

      const isError = call.status === 'error';
      const durations =
        call.durationMs != null
          ? [...existing.durations, call.durationMs]
          : existing.durations;

      bySkill.set(call.skillName, {
        durations,
        errorCount: isError ? existing.errorCount + 1 : existing.errorCount,
        totalCount: existing.totalCount + 1,
        totalTokens: existing.totalTokens + tokenPerSkill,
      });
    }
  }

  return Array.from(bySkill.entries()).map(([skillName, accum]) => ({
    skillName,
    requestCount: accum.totalCount,
    avgDurationMs: Math.round(avg(accum.durations)),
    totalTokens: accum.totalTokens,
    errorRate: accum.totalCount === 0 ? 0 : accum.errorCount / accum.totalCount,
  }));
}

export function toTraceListItem(record: ObservabilityRecord): TraceListItem {
  return {
    traceId: record.traceId,
    userId: record.userId,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    status: record.status,
    ...(record.model ? { model: record.model } : {}),
    ...(record.tokenUsage ? { totalTokens: record.tokenUsage.totalTokens } : {}),
    ...(record.estimatedCostUsd != null
      ? { estimatedCostUsd: record.estimatedCostUsd }
      : {}),
    toolCallCount: record.toolCallCount,
    agentCallCount: record.agentCallCount,
    skillCallCount: record.skillCallCount,
  };
}

export function toTraceDetail(record: ObservabilityRecord): TraceDetail {
  return {
    ...toTraceListItem(record),
    requestId: record.requestId,
    threadId: record.threadId,
    toolCalls: record.toolCalls.map((t) => ({
      toolCallId: t.toolCallId,
      toolName: t.toolName,
      startedAt: t.startedAt,
      ...(t.completedAt ? { completedAt: t.completedAt } : {}),
      durationMs: t.durationMs,
      status: t.status,
      ...(t.error ? { error: t.error } : {}),
    })),
    agentCalls: record.agentCalls.map((a) => ({
      agentName: a.agentName,
      ...(a.agentKind ? { agentKind: a.agentKind } : {}),
      ...(a.startedAt ? { startedAt: a.startedAt } : {}),
      ...(a.completedAt ? { completedAt: a.completedAt } : {}),
      ...(a.durationMs != null ? { durationMs: a.durationMs } : {}),
      ...(a.status ? { status: a.status } : {}),
    })),
    skillCalls: record.skillCalls.map((s) => ({
      skillName: s.skillName,
      ...(s.durationMs != null ? { durationMs: s.durationMs } : {}),
      ...(s.status ? { status: s.status } : {}),
    })),
    ...(record.tokenUsage ? { tokenUsage: record.tokenUsage } : {}),
  };
}

type ObservationStatus = 'success' | 'error' | 'cancelled';

export type ObservationToolCall = {
  toolCallId: string;
  toolName: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  status: 'success' | 'error' | 'cancelled';
  error?: string;
  metadata?: Record<string, unknown>;
};

export type ObservationSummary = {
  traceId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: ObservationStatus;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  reasoning?: {
    stepCount: number;
    summary?: string;
  };
  toolCalls: ObservationToolCall[];
  toolCallCount: number;
  toolFailureCount: number;
};

type ToolMetrics = {
  callCount?: number;
  errorCount?: number;
  totalTime?: number;
};

type AgentMetrics = {
  accumulatedUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  toolMetrics?: Record<string, ToolMetrics>;
};

type BuildSummaryInput = {
  traceId: string;
  startedAt: string;
  completedAt: string;
  status: ObservationStatus;
  toolCalls: ObservationToolCall[];
  inputTokens: number;
  outputTokens: number;
  reasoningStepCount: number;
  toolCallCountOverride?: number;
  toolFailureCountOverride?: number;
};

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key)/i;

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(iso: string): number {
  return new Date(iso).getTime();
}

function clampDurationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, toMillis(completedAt) - toMillis(startedAt));
}

function buildSyntheticToolCallId(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

function summarizeReasoning(stepCount: number): string | undefined {
  if (stepCount <= 0) return undefined;
  if (stepCount === 1) return 'Reasoning step: 1';
  return `Reasoning steps: ${stepCount}`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return '[truncated]';
  }
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return Object.fromEntries(
      entries.map(([key, nested]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }
        return [key, sanitizeValue(nested, depth + 1)];
      }),
    );
  }
  return value;
}

function parseToolResultContent(content: unknown): unknown {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(content)) {
    const firstText = content.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        'text' in item &&
        typeof (item as { text?: unknown }).text === 'string',
    ) as { text?: string } | undefined;

    if (!firstText?.text) {
      return undefined;
    }

    try {
      return JSON.parse(firstText.text);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractToolMetadata(content: unknown): Record<string, unknown> | undefined {
  const parsed = parseToolResultContent(content);
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const value = parsed as Record<string, unknown>;
  const metadata =
    value.metadata && typeof value.metadata === 'object'
      ? (value.metadata as Record<string, unknown>)
      : undefined;

  const extracted = {
    ...(typeof value.status === 'string' ? { status: value.status } : {}),
    ...(typeof value.agentKind === 'string' ? { agentKind: value.agentKind } : {}),
    ...(typeof value.agentName === 'string' ? { agentName: value.agentName } : {}),
    ...(typeof value.handoffMode === 'string' ? { handoffMode: value.handoffMode } : {}),
    ...(metadata?.parentAgent ? { parentAgent: metadata.parentAgent } : {}),
    ...(metadata?.childAgent ? { childAgent: metadata.childAgent } : {}),
    ...(metadata?.handoffTool ? { handoffTool: metadata.handoffTool } : {}),
    ...(metadata?.traceId ? { traceId: metadata.traceId } : {}),
    ...(metadata?.sessionId ? { sessionId: metadata.sessionId } : {}),
    ...(metadata?.threadId ? { threadId: metadata.threadId } : {}),
    ...(metadata?.userId ? { userId: metadata.userId } : {}),
  };

  return Object.keys(extracted).length > 0
    ? (sanitizeValue(extracted) as Record<string, unknown>)
    : undefined;
}

function buildObservationSummary(input: BuildSummaryInput): ObservationSummary {
  const computedToolCallCount = input.toolCalls.length;
  const computedToolFailureCount = input.toolCalls.filter(
    (call) => call.status !== 'success',
  ).length;
  const toolCallCount = input.toolCallCountOverride ?? computedToolCallCount;
  const toolFailureCount = input.toolFailureCountOverride ?? computedToolFailureCount;
  const reasoningSummary = summarizeReasoning(input.reasoningStepCount);
  const reasoning = reasoningSummary
    ? {
        stepCount: input.reasoningStepCount,
        summary: reasoningSummary,
      }
    : {
        stepCount: input.reasoningStepCount,
      };

  return {
    traceId: input.traceId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: clampDurationMs(input.startedAt, input.completedAt),
    status: input.status,
    tokenUsage: {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.inputTokens + input.outputTokens,
    },
    reasoning,
    toolCalls: input.toolCalls,
    toolCallCount,
    toolFailureCount,
  };
}

export class ObservationCollector {
  private readonly traceId: string;
  private readonly startedAt: string;
  private readonly debugEnabled: boolean;
  private readonly toolCalls: ObservationToolCall[] = [];
  private readonly inFlightToolStarts = new Map<
    string,
    { toolCallId: string; toolName: string; startedAt: string }
  >();
  private readonly completedToolUseIds = new Set<string>();
  private modelToolStartCount = 0;
  private modelToolFailureCount = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private reasoningStepCount = 0;
  private metricsToolCallCount: number | undefined;
  private metricsToolFailureCount: number | undefined;

  constructor(traceId: string, startedAt: string, debugEnabled: boolean) {
    this.traceId = traceId;
    this.startedAt = startedAt;
    this.debugEnabled = debugEnabled;
  }

  getTraceId(): string {
    return this.traceId;
  }

  logStreamEventType(type: string) {
    this.logDebug('stream-event', { type });
  }

  onReasoningDelta(text: string | undefined) {
    if (typeof text === 'string' && text.length > 0) {
      this.reasoningStepCount += 1;
    }
  }

  onModelToolUseStart(toolUseId: string, name: string) {
    this.modelToolStartCount += 1;
    this.inFlightToolStarts.set(toolUseId, {
      toolCallId: toolUseId,
      toolName: name,
      startedAt: nowIso(),
    });
    this.logDebug('tool-use-start', {
      toolUseId,
      name,
      modelToolStartCount: this.modelToolStartCount,
    });
  }

  onContentToolUseBlock(toolUseId: string, name: string) {
    this.inFlightToolStarts.set(toolUseId, {
      toolCallId: toolUseId,
      toolName: name,
      startedAt: nowIso(),
    });
  }

  onToolResult(toolUseId: string, status: 'success' | 'error', content: unknown) {
    if (this.completedToolUseIds.has(toolUseId)) {
      return;
    }
    this.completedToolUseIds.add(toolUseId);
    const start = this.inFlightToolStarts.get(toolUseId);
    this.inFlightToolStarts.delete(toolUseId);
    const completedAt = nowIso();
    const toolCall: ObservationToolCall = {
      toolCallId: start?.toolCallId ?? toolUseId,
      toolName: start?.toolName ?? 'unknown_tool',
      startedAt: start?.startedAt ?? completedAt,
      completedAt,
      durationMs: clampDurationMs(start?.startedAt ?? completedAt, completedAt),
      status: status === 'error' ? 'error' : 'success',
    };
    const metadata = extractToolMetadata(content);
    if (metadata) {
      toolCall.metadata = metadata;
    }
    if (status === 'error') {
      this.modelToolFailureCount += 1;
      const firstLine = JSON.stringify(sanitizeValue(content));
      toolCall.error =
        firstLine.length > 160 ? `${firstLine.slice(0, 160)}...` : firstLine;
    }
    this.toolCalls.push(toolCall);
  }

  onModelMetadataUsage(
    usage: { inputTokens?: number; outputTokens?: number } | undefined,
  ) {
    this.inputTokens = usage?.inputTokens ?? this.inputTokens;
    this.outputTokens = usage?.outputTokens ?? this.outputTokens;
  }

  onAgentMetrics(metrics: AgentMetrics | undefined) {
    const accumulatedUsage = metrics?.accumulatedUsage;
    if (accumulatedUsage) {
      this.inputTokens = accumulatedUsage.inputTokens ?? this.inputTokens;
      this.outputTokens = accumulatedUsage.outputTokens ?? this.outputTokens;
    }

    const toolMetrics = metrics?.toolMetrics;
    if (!toolMetrics) {
      return;
    }

    let callCount = 0;
    let failureCount = 0;
    for (const [toolName, metric] of Object.entries(toolMetrics)) {
      callCount += metric.callCount ?? 0;
      failureCount += metric.errorCount ?? 0;

      if (this.toolCalls.length === 0 && (metric.callCount ?? 0) > 0) {
        this.toolCalls.push({
          toolCallId: buildSyntheticToolCallId('metrics', toolName),
          toolName,
          startedAt: this.startedAt,
          completedAt: nowIso(),
          durationMs: Math.max(0, Math.round(metric.totalTime ?? 0)),
          status: (metric.errorCount ?? 0) > 0 ? 'error' : 'success',
        });
      }
    }
    this.metricsToolCallCount = callCount;
    this.metricsToolFailureCount = failureCount;
  }

  finalizeMissingToolCounts() {
    if (this.toolCalls.length === 0 && this.modelToolStartCount > 0) {
      const completedAt = nowIso();
      this.toolCalls.push({
        toolCallId: buildSyntheticToolCallId('fallback', `${this.traceId}:tool_call`),
        toolName: 'tool_call',
        startedAt: this.startedAt,
        completedAt,
        durationMs: clampDurationMs(this.startedAt, completedAt),
        status: this.modelToolFailureCount > 0 ? 'error' : 'success',
      });
      if (this.metricsToolCallCount === undefined) {
        this.metricsToolCallCount = this.modelToolStartCount;
      }
      if (this.metricsToolFailureCount === undefined) {
        this.metricsToolFailureCount = this.modelToolFailureCount;
      }
    }
  }

  createSnapshot(status: ObservationStatus, completedAt = nowIso()): ObservationSummary {
    return buildObservationSummary({
      traceId: this.traceId,
      startedAt: this.startedAt,
      completedAt,
      status,
      toolCalls: this.toolCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      reasoningStepCount: this.reasoningStepCount,
      ...(typeof this.metricsToolCallCount === 'number'
        ? { toolCallCountOverride: this.metricsToolCallCount }
        : {}),
      ...(typeof this.metricsToolFailureCount === 'number'
        ? { toolFailureCountOverride: this.metricsToolFailureCount }
        : {}),
    });
  }

  logFinalSummary() {
    this.logDebug('final-summary', {
      traceId: this.traceId,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      metricsToolCallCount: this.metricsToolCallCount,
      metricsToolFailureCount: this.metricsToolFailureCount,
      modelToolStartCount: this.modelToolStartCount,
      modelToolFailureCount: this.modelToolFailureCount,
      toolCallsLength: this.toolCalls.length,
    });
  }

  private logDebug(message: string, data?: Record<string, unknown>) {
    if (!this.debugEnabled) {
      return;
    }
    if (data) {
      console.info('[runtime-observability-debug]', message, JSON.stringify(data));
      return;
    }
    console.info('[runtime-observability-debug]', message);
  }
}

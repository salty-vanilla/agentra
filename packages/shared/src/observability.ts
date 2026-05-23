import { z } from 'zod';
import type { ChatObservationSummary } from './chat.js';

const SENSITIVE_KEY_RE = /token|secret|password|authorization|api[_-]?key/i;

export function sanitizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [
      k,
      SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : v,
    ]),
  );
}

const observabilityToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().optional(),
});

const observabilityAgentCallSchema = z.object({
  agentName: z.string().min(1),
  agentKind: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0).optional(),
  status: z.enum(['success', 'error', 'cancelled']).optional(),
});

const observabilitySkillCallSchema = z.object({
  skillName: z.string().min(1),
  durationMs: z.number().int().min(0).optional(),
  status: z.enum(['success', 'error', 'cancelled']).optional(),
});

export const observabilityRecordSchema = z.object({
  traceId: z.string().min(1),
  requestId: z.string().min(1),
  threadId: z.string().min(1),
  assistantMessageId: z.string().optional(),
  userId: z.string().min(1),

  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),

  model: z.string().optional(),
  modelKey: z.enum(['opus', 'sonnet', 'haiku']).optional(),

  tokenUsage: z
    .object({
      inputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0),
    })
    .optional(),

  estimatedCostUsd: z.number().min(0).optional(),

  toolCalls: z.array(observabilityToolCallSchema),
  agentCalls: z.array(observabilityAgentCallSchema),
  skillCalls: z.array(observabilitySkillCallSchema),

  toolCallCount: z.number().int().min(0),
  toolFailureCount: z.number().int().min(0),
  agentCallCount: z.number().int().min(0),
  skillCallCount: z.number().int().min(0),

  createdAt: z.string().datetime(),
  schemaVersion: z.literal(1),
});

export type ObservabilityRecord = z.infer<typeof observabilityRecordSchema>;
export type ObservabilityAgentCall = z.infer<typeof observabilityAgentCallSchema>;
export type ObservabilitySkillCall = z.infer<typeof observabilitySkillCallSchema>;

export type NormalizeObservabilityRecordInput = {
  summary: ChatObservationSummary;
  requestId: string;
  threadId: string;
  userId: string;
  model?: string;
  modelKey?: 'opus' | 'sonnet' | 'haiku';
  assistantMessageId?: string;
};

export function normalizeObservabilityRecord(
  input: NormalizeObservabilityRecordInput,
): ObservabilityRecord {
  const { summary, requestId, threadId, userId, model, modelKey, assistantMessageId } =
    input;

  const toolCalls = summary.toolCalls.map((tc) => ({
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    startedAt: tc.startedAt,
    ...(tc.completedAt ? { completedAt: tc.completedAt } : {}),
    durationMs: tc.durationMs,
    status: tc.status,
    ...(tc.error ? { error: tc.error } : {}),
  }));

  return {
    traceId: summary.traceId,
    requestId,
    threadId,
    ...(assistantMessageId ? { assistantMessageId } : {}),
    userId,

    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    status: summary.status,

    ...(model ? { model } : {}),
    ...(modelKey ? { modelKey } : {}),

    ...(summary.tokenUsage ? { tokenUsage: summary.tokenUsage } : {}),

    toolCalls,
    agentCalls: [],
    skillCalls: [],

    toolCallCount: summary.toolCallCount,
    toolFailureCount: summary.toolFailureCount,
    agentCallCount: 0,
    skillCallCount: 0,

    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}

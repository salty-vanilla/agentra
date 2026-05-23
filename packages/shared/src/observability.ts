import { z } from 'zod';
import type { ChatObservationSummary } from './chat.js';

const SENSITIVE_KEY_RE = /token|secret|password|authorization|api[_-]?key/i;

// Shallow redaction: runtime constructs metadata from known extracted fields
// (agentName, agentKind, etc.), not from raw user input, so nested sensitive
// values are not expected at this layer.
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

// ── Tool call patterns for skill detection ────────────────────────────────────

const SKILL_PATTERNS: Array<{ skillName: string; pattern: RegExp }> = [
  { skillName: 'web_research', pattern: /web[_-]?(search|research)|search[_-]?web/i },
  {
    skillName: 'slide_generation',
    pattern: /slide[_-]?(gen|creat|build)|creat[_-]?slide|presentation/i,
  },
  { skillName: 'kb_search', pattern: /kb[_-]?search|knowledge[_-]?base/i },
  { skillName: 'thread_files', pattern: /thread[_-]?file|file[_-]?search/i },
];

function detectSkillName(toolName: string, agentKind?: string): string | undefined {
  for (const { skillName, pattern } of SKILL_PATTERNS) {
    if (pattern.test(toolName)) return skillName;
  }
  if (agentKind) {
    for (const { skillName, pattern } of SKILL_PATTERNS) {
      if (pattern.test(agentKind)) return skillName;
    }
  }
  return undefined;
}

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const observabilityToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

// ── Main schema ───────────────────────────────────────────────────────────────

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

// ── Extraction helpers ────────────────────────────────────────────────────────

type RawToolCall = ChatObservationSummary['toolCalls'][number];

function extractAgentCalls(toolCalls: RawToolCall[]): ObservabilityAgentCall[] {
  return toolCalls.flatMap((tc) => {
    const agentName = tc.metadata?.agentName;
    if (typeof agentName !== 'string') return [];

    const agentKind = tc.metadata?.agentKind;
    return [
      {
        agentName,
        ...(typeof agentKind === 'string' ? { agentKind } : {}),
        startedAt: tc.startedAt,
        ...(tc.completedAt ? { completedAt: tc.completedAt } : {}),
        durationMs: tc.durationMs,
        status: tc.status,
      },
    ];
  });
}

function extractSkillCalls(toolCalls: RawToolCall[]): ObservabilitySkillCall[] {
  return toolCalls.flatMap((tc) => {
    const agentKind =
      typeof tc.metadata?.agentKind === 'string' ? tc.metadata.agentKind : undefined;
    const skillName = detectSkillName(tc.toolName, agentKind);
    if (!skillName) return [];
    return [{ skillName, durationMs: tc.durationMs, status: tc.status }];
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

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
    ...(tc.metadata ? { metadata: sanitizeMetadata(tc.metadata) } : {}),
  }));

  const agentCalls = extractAgentCalls(summary.toolCalls);
  const skillCalls = extractSkillCalls(summary.toolCalls);

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
    agentCalls,
    skillCalls,

    toolCallCount: summary.toolCallCount,
    toolFailureCount: summary.toolFailureCount,
    agentCallCount: agentCalls.length,
    skillCallCount: skillCalls.length,

    createdAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}

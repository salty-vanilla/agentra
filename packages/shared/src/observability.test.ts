import { describe, expect, it } from 'vitest';
import type { ChatObservationSummary } from './chat.js';
import {
  normalizeObservabilityRecord,
  observabilityRecordSchema,
  sanitizeMetadata,
} from './observability.js';

const baseSummary: ChatObservationSummary = {
  traceId: 'trace-001',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:05.000Z',
  durationMs: 5000,
  status: 'success',
  toolCalls: [],
  toolCallCount: 0,
  toolFailureCount: 0,
};

const baseInput = {
  summary: baseSummary,
  requestId: 'req-001',
  threadId: 'thread-001',
  userId: 'user-001',
};

describe('normalizeObservabilityRecord', () => {
  it('builds a valid record for a successful request', () => {
    const record = normalizeObservabilityRecord(baseInput);

    expect(record.traceId).toBe('trace-001');
    expect(record.requestId).toBe('req-001');
    expect(record.status).toBe('success');
    expect(record.durationMs).toBe(5000);
    expect(record.toolCalls).toHaveLength(0);
    expect(record.agentCalls).toHaveLength(0);
    expect(record.skillCalls).toHaveLength(0);
    expect(record.toolCallCount).toBe(0);
    expect(record.toolFailureCount).toBe(0);
    expect(record.agentCallCount).toBe(0);
    expect(record.skillCallCount).toBe(0);
    expect(record.schemaVersion).toBe(1);
  });

  it('sets status to error correctly', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: { ...baseSummary, status: 'error' },
    });
    expect(record.status).toBe('error');
  });

  it('sets status to cancelled correctly', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: { ...baseSummary, status: 'cancelled' },
    });
    expect(record.status).toBe('cancelled');
  });

  it('includes tokenUsage when present', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    });
    expect(record.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
  });

  it('omits tokenUsage when absent', () => {
    const record = normalizeObservabilityRecord(baseInput);
    expect(record.tokenUsage).toBeUndefined();
  });

  it('includes model and modelKey when provided', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      model: 'us.anthropic.claude-sonnet-4-6',
      modelKey: 'sonnet',
    });
    expect(record.model).toBe('us.anthropic.claude-sonnet-4-6');
    expect(record.modelKey).toBe('sonnet');
  });

  it('includes assistantMessageId when provided', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      assistantMessageId: 'msg-123',
    });
    expect(record.assistantMessageId).toBe('msg-123');
  });

  it('omits assistantMessageId when not provided', () => {
    const record = normalizeObservabilityRecord(baseInput);
    expect(record.assistantMessageId).toBeUndefined();
  });

  it('maps tool calls and sanitizes metadata', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'web_search',
            startedAt: '2026-01-01T00:00:01.000Z',
            completedAt: '2026-01-01T00:00:02.000Z',
            durationMs: 1000,
            status: 'success',
            metadata: { query: 'hello', apiKey: 'secret123' },
          },
        ],
        toolCallCount: 1,
        toolFailureCount: 0,
      },
    });

    expect(record.toolCalls).toHaveLength(1);
    const [tc0] = record.toolCalls;
    expect(tc0?.toolName).toBe('web_search');
    expect(tc0?.metadata?.query).toBe('hello');
    expect(tc0?.metadata?.apiKey).toBe('[REDACTED]');
  });

  it('omits metadata when not present on tool call', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'search',
            startedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 500,
            status: 'success',
          },
        ],
        toolCallCount: 1,
        toolFailureCount: 0,
      },
    });

    const [tc0] = record.toolCalls;
    expect(tc0?.metadata).toBeUndefined();
  });

  describe('agentCalls extraction', () => {
    it('extracts agentCalls from tool calls with agentName in metadata', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-agent-1',
              toolName: 'invoke_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              completedAt: '2026-01-01T00:00:03.000Z',
              durationMs: 2000,
              status: 'success',
              metadata: { agentName: 'WebResearcher', agentKind: 'specialist' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(1);
      expect(record.agentCallCount).toBe(1);
      const [ac] = record.agentCalls;
      expect(ac?.agentName).toBe('WebResearcher');
      expect(ac?.agentKind).toBe('specialist');
      expect(ac?.durationMs).toBe(2000);
      expect(ac?.status).toBe('success');
    });

    it('extracts multiple agentCalls from multiple agent tool calls', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'invoke_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1000,
              status: 'success',
              metadata: { agentName: 'AgentA' },
            },
            {
              toolCallId: 'tc-2',
              toolName: 'invoke_agent',
              startedAt: '2026-01-01T00:00:02.000Z',
              durationMs: 500,
              status: 'error',
              metadata: { agentName: 'AgentB', agentKind: 'router' },
            },
          ],
          toolCallCount: 2,
          toolFailureCount: 1,
        },
      });

      expect(record.agentCalls).toHaveLength(2);
      expect(record.agentCallCount).toBe(2);
    });

    it('does not include agentKind when absent from metadata', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'invoke_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1000,
              status: 'success',
              metadata: { agentName: 'SomeAgent' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      const [ac] = record.agentCalls;
      expect(ac?.agentKind).toBeUndefined();
    });

    it('excludes tool calls without agentName from agentCalls', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-plain',
              toolName: 'web_search',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 500,
              status: 'success',
              metadata: { query: 'test' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(0);
      expect(record.agentCallCount).toBe(0);
    });
  });

  describe('skillCalls extraction', () => {
    it('detects web_research skill from web_search tool name', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'web_search',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 800,
              status: 'success',
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.skillCalls).toHaveLength(1);
      expect(record.skillCallCount).toBe(1);
      const [sc] = record.skillCalls;
      expect(sc?.skillName).toBe('web_research');
      expect(sc?.durationMs).toBe(800);
      expect(sc?.status).toBe('success');
    });

    it('detects slide_generation skill', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'create_slide_presentation',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 5000,
              status: 'success',
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.skillCalls).toHaveLength(1);
      const [sc] = record.skillCalls;
      expect(sc?.skillName).toBe('slide_generation');
    });

    it('detects kb_search skill', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'kb_search',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 300,
              status: 'success',
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      const [sc] = record.skillCalls;
      expect(sc?.skillName).toBe('kb_search');
    });

    it('creates both agentCall and skillCall when toolName matches a skill pattern and agentName is present', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'web_search',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 500,
              status: 'success',
              metadata: { agentName: 'WebAgent' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(1);
      expect(record.skillCalls).toHaveLength(1);
      expect(record.skillCalls[0]?.skillName).toBe('web_research');
    });

    it('creates both agentCall and skillCall for invoke_web_research_agent shape', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'invoke_web_research_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              completedAt: '2026-01-01T00:00:04.000Z',
              durationMs: 3000,
              status: 'success',
              metadata: { agentName: 'WebResearchAgent', agentKind: 'specialist' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(1);
      expect(record.agentCalls[0]?.agentName).toBe('WebResearchAgent');
      expect(record.skillCalls).toHaveLength(1);
      expect(record.skillCalls[0]?.skillName).toBe('web_research');
      expect(record.skillCallCount).toBe(1);
    });

    it('creates agentCall but no skillCall for invoke_manufacturing_line_agent shape', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'invoke_manufacturing_line_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 2000,
              status: 'success',
              metadata: { agentName: 'ManufacturingAgent', agentKind: 'specialist' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(1);
      expect(record.skillCalls).toHaveLength(0);
      expect(record.skillCallCount).toBe(0);
    });

    it('detects skill from agentKind when toolName does not match any pattern', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'invoke_agent',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1500,
              status: 'success',
              metadata: { agentName: 'KbAgent', agentKind: 'kb_search' },
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.agentCalls).toHaveLength(1);
      expect(record.skillCalls).toHaveLength(1);
      expect(record.skillCalls[0]?.skillName).toBe('kb_search');
    });

    it('returns empty skillCalls for unrecognized tool names', () => {
      const record = normalizeObservabilityRecord({
        ...baseInput,
        summary: {
          ...baseSummary,
          toolCalls: [
            {
              toolCallId: 'tc-1',
              toolName: 'custom_tool',
              startedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 200,
              status: 'success',
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      });

      expect(record.skillCalls).toHaveLength(0);
      expect(record.skillCallCount).toBe(0);
    });
  });

  it('produces a schema-valid record with mixed tool/agent/skill calls', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        toolCalls: [
          {
            toolCallId: 'tc-agent',
            toolName: 'invoke_agent',
            startedAt: '2026-01-01T00:00:01.000Z',
            completedAt: '2026-01-01T00:00:02.000Z',
            durationMs: 1000,
            status: 'success',
            metadata: { agentName: 'SomeAgent', agentKind: 'specialist' },
          },
          {
            toolCallId: 'tc-skill',
            toolName: 'web_search',
            startedAt: '2026-01-01T00:00:02.000Z',
            completedAt: '2026-01-01T00:00:03.000Z',
            durationMs: 1000,
            status: 'success',
          },
        ],
        toolCallCount: 2,
        toolFailureCount: 0,
      },
      model: 'claude-sonnet',
      modelKey: 'sonnet',
      assistantMessageId: 'msg-xyz',
    });

    expect(record.agentCallCount).toBe(1);
    expect(record.skillCallCount).toBe(1);
    const result = observabilityRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });
});

describe('sanitizeMetadata', () => {
  it('redacts token keys', () => {
    const result = sanitizeMetadata({ token: 'abc123', name: 'test' });
    expect(result.token).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('redacts secret keys', () => {
    expect(sanitizeMetadata({ secret: 'mysecret' }).secret).toBe('[REDACTED]');
  });

  it('redacts password keys', () => {
    expect(sanitizeMetadata({ password: 'p@ss' }).password).toBe('[REDACTED]');
  });

  it('redacts authorization keys', () => {
    expect(sanitizeMetadata({ authorization: 'Bearer xyz' }).authorization).toBe(
      '[REDACTED]',
    );
  });

  it('redacts api_key (underscore) and apiKey (camelCase)', () => {
    const result = sanitizeMetadata({ api_key: 'k1', apiKey: 'k2' });
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
  });

  it('preserves non-sensitive keys', () => {
    const result = sanitizeMetadata({ toolName: 'search', durationMs: 100 });
    expect(result.toolName).toBe('search');
    expect(result.durationMs).toBe(100);
  });

  it('returns empty object for empty input', () => {
    expect(sanitizeMetadata({})).toEqual({});
  });
});

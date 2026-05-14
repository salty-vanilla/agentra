import { chatObservationSummarySchema } from '@agentra/shared';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { chatCommandSchema } from '../lib/chat-command.js';

const addFormats = addFormatsModule.default ?? addFormatsModule;

const validObservation = {
  traceId: 'trace-001',
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: '2024-01-01T00:00:01.000Z',
  durationMs: 1000,
  status: 'success' as const,
  toolCalls: [],
  toolCallCount: 0,
  toolFailureCount: 0,
};

describe('ErrorResponse.details contract', () => {
  it('backend validation errors shape is an array', async () => {
    const { OpenAPIBackend } = await import('openapi-backend');
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const candidates = [
      resolve(process.cwd(), 'docs/openapi/agentra-bff.openapi.yaml'),
      resolve(process.cwd(), '../docs/openapi/agentra-bff.openapi.yaml'),
      resolve(process.cwd(), '../../docs/openapi/agentra-bff.openapi.yaml'),
    ];
    const definitionPath = candidates.find((p) => existsSync(p));
    if (!definitionPath) {
      return;
    }

    const api = new OpenAPIBackend({
      definition: definitionPath,
      customizeAjv: (ajv) => {
        addFormats(ajv, { mode: 'fast', formats: ['date-time', 'uri', 'uuid'] });
        return ajv;
      },
    });
    await api.init();

    const result = api.validateRequest(
      {
        method: 'POST',
        path: '/chat',
        headers: { 'content-type': 'application/json' },
        body: {},
      },
      'postChat',
    );

    expect(Array.isArray(result.errors)).toBe(true);
    expect((result.errors?.length ?? 0) > 0).toBe(true);
  });
});

describe('invalid runtime observation handling', () => {
  it('chatObservationSummarySchema rejects payload missing required fields', () => {
    const result = chatObservationSummarySchema.safeParse({
      traceId: 'x',
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('chatObservationSummarySchema rejects negative durationMs', () => {
    const result = chatObservationSummarySchema.safeParse({
      ...validObservation,
      durationMs: -1,
    });
    expect(result.success).toBe(false);
  });

  it('chatObservationSummarySchema rejects invalid status enum', () => {
    const result = chatObservationSummarySchema.safeParse({
      ...validObservation,
      status: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('chatObservationSummarySchema accepts a valid full observation', () => {
    const result = chatObservationSummarySchema.safeParse({
      ...validObservation,
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      reasoning: { stepCount: 3, summary: 'Reasoned about the task' },
      toolCalls: [
        {
          toolCallId: 'tc-1',
          toolName: 'search',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:00:01.000Z',
          durationMs: 500,
          status: 'success',
        },
      ],
      toolCallCount: 1,
      toolFailureCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('chatObservationSummarySchema rejects empty object', () => {
    const result = chatObservationSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ChatCommand schema parity (backend Zod vs OpenAPI)', () => {
  it('chatCommandSchema accepts template field', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'Test',
      template: { brandFrameId: 'frame-001' },
    });
    expect(result.success).toBe(true);
  });

  it('chatCommandSchema accepts icons field', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'Test',
      icons: {
        enabled: true,
        providerId: 'lucide-local',
        preferredIconIds: ['check', 'x'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('chatCommandSchema accepts template with empty object (all optional fields)', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'Test',
      template: {},
    });
    expect(result.success).toBe(true);
  });

  it('chatCommandSchema accepts icons with empty object', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'Test',
      icons: {},
    });
    expect(result.success).toBe(true);
  });

  it('chatCommandSchema accepts command without template or icons', () => {
    const result = chatCommandSchema.safeParse({
      type: 'create_slide_presentation',
      topic: 'Test topic',
    });
    expect(result.success).toBe(true);
  });
});

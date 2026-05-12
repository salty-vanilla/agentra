import { describe, expect, it, vi } from 'vitest';
import {
  buildManufacturingLineAgentHandoffPrompt,
  manufacturingLineAgentHandoffInputSchema,
} from '../agents/manufacturing-line/handoff.js';
import {
  executeInvokeManufacturingLineAgentTool,
  streamInvokeManufacturingLineAgentTool,
} from '../tools/invoke-manufacturing-line-agent.tool.js';

describe('Manufacturing Line Agent handoff', () => {
  it('validates question, context, and metadata limits', () => {
    expect(() =>
      manufacturingLineAgentHandoffInputSchema.parse({
        question: '',
      }),
    ).toThrow();

    expect(() =>
      manufacturingLineAgentHandoffInputSchema.parse({
        question: 'Valid question',
        context: 'x'.repeat(8001),
      }),
    ).toThrow();

    const metadata = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key_${index}`, index]),
    );

    expect(() =>
      manufacturingLineAgentHandoffInputSchema.parse({
        question: 'Valid question',
        metadata,
      }),
    ).toThrow('metadata must not exceed 100 keys');
  });

  it('builds a focused manufacturing-line prompt', () => {
    const prompt = buildManufacturingLineAgentHandoffPrompt({
      question: 'What caused the line stoppage?',
      context: 'Shift 2, line A, and the operator saw an alarm code.',
      mode: 'diagnostics',
      requireCitations: true,
      createBrief: true,
      metadata: {
        targetSignals: ['alarm_code', 'downtime'],
      },
    });

    expect(prompt).toContain('focused handoff for the Manufacturing Line Agent');
    expect(prompt).toContain('What caused the line stoppage?');
    expect(prompt).toContain('Shift 2, line A');
    expect(prompt).toContain('Mode: diagnostics');
    expect(prompt).toContain('Require citations: yes');
    expect(prompt).toContain('Create brief: yes');
    expect(prompt).toContain('targetSignals');
  });

  it('constrains the answer length and routes detail into structured fields', () => {
    const prompt = buildManufacturingLineAgentHandoffPrompt({
      question: 'How do I respond to a temperature anomaly alarm?',
    });

    expect(prompt).toContain('target under 800 output tokens');
    expect(prompt).toContain('reference the source document via citations');
    expect(prompt).toContain(
      'omit safety notices, recovery procedures, and background sections from answer by default',
    );
    expect(prompt).toContain('place follow-up steps in nextActions');
  });

  it('invokes the Manufacturing Line Agent with the focused prompt and preserves structured output', async () => {
    const invoke = vi.fn().mockResolvedValue({
      structuredOutput: {
        status: 'success' as const,
        answer: 'The line stopped because the safety gate was open.',
        citations: [{ sourceId: 'doc-1' }],
        metadata: { confidence: 'high' },
      },
      toString() {
        return 'The line stopped because the safety gate was open.';
      },
    });

    const response = await executeInvokeManufacturingLineAgentTool(
      {
        question: 'Why did the line stop?',
        context: 'Safety gate alarm triggered.',
        mode: 'kb',
        requireCitations: true,
      },
      {
        agentFactory: () => ({ invoke }),
      },
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toContain('Why did the line stop?');
    expect(invoke.mock.calls[0]?.[0]).toContain('Mode: kb');
    expect(invoke.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        structuredOutputSchema: expect.any(Object),
      }),
    );

    const payload = JSON.parse(response.content[0].text);
    expect(response.status).toBe('success');
    expect(payload).toEqual({
      status: 'success',
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: 'kb',
      answer: 'The line stopped because the safety gate was open.',
      citations: [{ sourceId: 'doc-1' }],
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        handoffMode: 'kb',
        confidence: 'high',
      },
    });
  });

  it('normalizes invocation failures into a structured error payload', async () => {
    const response = await executeInvokeManufacturingLineAgentTool(
      {
        question: 'Why did the line stop?',
      },
      {
        agentFactory: () => ({
          invoke: vi.fn().mockRejectedValue(new Error('boom')),
        }),
      },
    );

    expect(response.status).toBe('error');
    expect(JSON.parse(response.content[0].text)).toEqual({
      status: 'error',
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: 'auto',
      answer: 'boom',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        handoffMode: 'auto',
        rawValueType: 'undefined',
      },
    });
  });
});

describe('streamInvokeManufacturingLineAgentTool', () => {
  function makeAgentResult(structuredOutput: unknown) {
    return {
      structuredOutput,
      toString() {
        return JSON.stringify(structuredOutput);
      },
      metrics: undefined,
    };
  }

  async function* makeAgentStream(events: unknown[], result: unknown) {
    for (const event of events) {
      yield event;
    }
    return result;
  }

  it('yields running then complete progress events for each sub-agent tool call', async () => {
    const toolUseId = 'tool-1';
    const agentResult = makeAgentResult({
      status: 'success' as const,
      answer: 'KB result',
      citations: [],
    });

    const streamEvents = [
      {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockStartEvent',
          start: { type: 'toolUseStart', toolUseId, name: 'kb_retrieve' },
        },
      },
      {
        type: 'toolResultEvent',
        result: { toolUseId, status: 'success', content: [] },
      },
    ];

    const stream = makeAgentStream(streamEvents, agentResult);
    const progress: unknown[] = [];

    const gen = streamInvokeManufacturingLineAgentTool(
      { question: 'What is the procedure?' },
      {
        agentFactory: () => ({
          invoke: vi.fn(),
          stream: vi.fn().mockReturnValue(stream),
        }),
      },
    );

    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        expect(value.status).toBe('success');
        break;
      }
      progress.push(value);
    }

    expect(progress).toEqual([
      { stage: 'kb_retrieve', status: 'running' },
      { stage: 'kb_retrieve', status: 'complete', durationMs: expect.any(Number) },
    ]);
  });

  it('yields error status when sub-agent tool returns error', async () => {
    const toolUseId = 'tool-err';
    const agentResult = makeAgentResult({ status: 'success', answer: 'done' });

    const streamEvents = [
      {
        type: 'contentBlockEvent',
        contentBlock: { type: 'toolUseBlock', toolUseId, name: 'structured_rag_flow' },
      },
      {
        type: 'toolResultEvent',
        result: { toolUseId, status: 'error', content: [] },
      },
    ];

    const stream = makeAgentStream(streamEvents, agentResult);
    const progress: unknown[] = [];

    const gen = streamInvokeManufacturingLineAgentTool(
      { question: 'Diagnose fault' },
      {
        agentFactory: () => ({
          invoke: vi.fn(),
          stream: vi.fn().mockReturnValue(stream),
        }),
      },
    );

    while (true) {
      const { value, done } = await gen.next();
      if (done) break;
      progress.push(value);
    }

    expect(progress).toContainEqual(
      expect.objectContaining({ stage: 'structured_rag_flow', status: 'error' }),
    );
  });

  it('returns error payload when the sub-agent stream throws', async () => {
    const failingStream = {
      next: () => Promise.reject(new Error('sub-agent failure')),
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    const gen = streamInvokeManufacturingLineAgentTool(
      { question: 'What failed?' },
      {
        agentFactory: () => ({
          invoke: vi.fn(),
          stream: vi.fn().mockReturnValue(failingStream),
        }),
      },
    );

    const { value, done } = await gen.next();
    expect(done).toBe(true);
    expect(value.status).toBe('error');
    expect(JSON.parse(value.content[0].text).answer).toContain('sub-agent failure');
  });
});

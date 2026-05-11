import { describe, expect, it, vi } from 'vitest';
import {
  buildManufacturingLineAgentHandoffPrompt,
  manufacturingLineAgentHandoffInputSchema,
} from '../agents/manufacturing-line/handoff.js';
import { executeInvokeManufacturingLineAgentTool } from '../tools/invoke-manufacturing-line-agent.tool.js';

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

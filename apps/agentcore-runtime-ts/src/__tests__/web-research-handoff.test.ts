import { describe, expect, it, vi } from 'vitest';
import {
  buildWebResearchAgentHandoffPrompt,
  webResearchAgentHandoffInputSchema,
} from '../agents/web-research/handoff.js';
import { executeInvokeWebResearchAgentTool } from '../tools/invoke-web-research-agent.tool.js';

describe('Web Research Agent handoff', () => {
  it('validates question, context, domain, and metadata limits', () => {
    expect(() =>
      webResearchAgentHandoffInputSchema.parse({
        question: '',
      }),
    ).toThrow();

    expect(() =>
      webResearchAgentHandoffInputSchema.parse({
        question: 'Valid question',
        context: 'x'.repeat(8001),
      }),
    ).toThrow();

    expect(() =>
      webResearchAgentHandoffInputSchema.parse({
        question: 'Valid question',
        allowedDomains: Array.from({ length: 51 }, (_, index) => `example-${index}.com`),
      }),
    ).toThrow();

    const metadata = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`key_${index}`, index]),
    );

    expect(() =>
      webResearchAgentHandoffInputSchema.parse({
        question: 'Valid question',
        metadata,
      }),
    ).toThrow('metadata must not exceed 100 keys');
  });

  it('builds a focused web research prompt', () => {
    const prompt = buildWebResearchAgentHandoffPrompt({
      question: 'What changed in the latest release?',
      context: 'Only use the public release notes and changelog.',
      freshnessRequired: true,
      allowedDomains: ['github.com', 'example.com'],
      blockedDomains: ['internal.example.com'],
      requireCitations: true,
      createBrief: true,
      metadata: {
        release: 'v1.2.3',
      },
    });

    expect(prompt).toContain('focused handoff for the Web Research Agent');
    expect(prompt).toContain('What changed in the latest release?');
    expect(prompt).toContain('Only use the public release notes and changelog.');
    expect(prompt).toContain('Freshness required: yes');
    expect(prompt).toContain('Require citations: yes');
    expect(prompt).toContain('Create brief: yes');
    expect(prompt).toContain('Allowed domains:');
    expect(prompt).toContain('Blocked domains:');
    expect(prompt).toContain('release');
  });

  it('invokes the Web Research Agent with the focused prompt and preserves structured output', async () => {
    const invoke = vi.fn().mockResolvedValue({
      structuredOutput: {
        status: 'success' as const,
        answer: 'The latest release added router handoff support.',
        sources: [{ id: 'source-1' }],
        citations: [{ label: '[1]' }],
        metadata: { confidence: 'high' },
      },
      toString() {
        return 'The latest release added router handoff support.';
      },
    });

    const response = await executeInvokeWebResearchAgentTool(
      {
        question: 'What changed in the latest release?',
        context: 'Use public release notes.',
        freshnessRequired: true,
        requireCitations: true,
        createBrief: true,
      },
      {
        agentFactory: () => ({ invoke }),
      },
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toContain('What changed in the latest release?');
    expect(invoke.mock.calls[0]?.[0]).toContain('Freshness required: yes');
    expect(invoke.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        structuredOutputSchema: expect.any(Object),
      }),
    );

    const payload = JSON.parse(response.content[0].text);
    expect(response.status).toBe('success');
    expect(payload).toEqual({
      status: 'success',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'freshness_required',
      answer: 'The latest release added router handoff support.',
      sources: [{ id: 'source-1' }],
      citations: [{ label: '[1]' }],
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        handoffMode: 'freshness_required',
        confidence: 'high',
      },
    });
  });

  it('normalizes null structuredOutput with JSON text fallback into structured payload', async () => {
    const jsonPayload = JSON.stringify({
      status: 'success',
      answer: 'The latest AI trends include multimodal models and agentic workflows.',
      sources: [{ url: 'https://example.com/ai-trends' }],
      citations: [{ label: '[1]', url: 'https://example.com/ai-trends' }],
      caveats: ['Results as of today'],
    });

    const invoke = vi.fn().mockResolvedValue({
      structuredOutput: null,
      toString() {
        return jsonPayload;
      },
    });

    const response = await executeInvokeWebResearchAgentTool(
      {
        question: 'What are the latest AI trends?',
      },
      {
        agentFactory: () => ({ invoke }),
      },
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(response.content[0].text);
    expect(response.status).toBe('success');
    expect(payload.status).toBe('success');
    expect(payload.sources).toHaveLength(1);
    expect(payload.citations).toHaveLength(1);
    expect(payload.caveats).toEqual(['Results as of today']);
    expect(payload.metadata?.rawValueType).toBe('string_json');
  });

  it('normalizes invocation failures into a structured error payload', async () => {
    const response = await executeInvokeWebResearchAgentTool(
      {
        question: 'What changed in the latest release?',
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
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'standard',
      answer: 'boom',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        handoffMode: 'standard',
        rawValueType: 'undefined',
      },
    });
  });
});

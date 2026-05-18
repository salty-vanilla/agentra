import { describe, expect, it, vi } from 'vitest';
import {
  buildWebResearchAgentHandoffPrompt,
  webResearchAgentHandoffInputSchema,
} from '../agents/web-research/handoff.js';
import {
  executeInvokeWebResearchAgentTool,
  streamInvokeWebResearchAgentTool,
} from '../tools/invoke-web-research-agent.tool.js';

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
    expect(prompt).toContain('Source limit: normalize at most 5 sources');
    expect(prompt).toContain(
      'include usedSourceIds, caveats, nextActions, and metadataSummary',
    );
    expect(prompt).toContain('do not include sources, citations, or brief');
    expect(prompt).toContain('Allowed domains:');
    expect(prompt).toContain('Blocked domains:');
    expect(prompt).toContain('release');
  });

  it('respects maxSources in the handoff prompt', () => {
    const promptDefault = buildWebResearchAgentHandoffPrompt({
      question: 'Latest news?',
    });
    expect(promptDefault).toContain('Source limit: normalize at most 5 sources');

    const promptCustom = buildWebResearchAgentHandoffPrompt({
      question: 'Latest news?',
      maxSources: 3,
    });
    expect(promptCustom).toContain('Source limit: normalize at most 3 sources');
  });

  it('rejects maxSources outside the 1–10 range', () => {
    expect(() =>
      webResearchAgentHandoffInputSchema.parse({ question: 'x', maxSources: 0 }),
    ).toThrow();
    expect(() =>
      webResearchAgentHandoffInputSchema.parse({ question: 'x', maxSources: 11 }),
    ).toThrow();
    expect(() =>
      webResearchAgentHandoffInputSchema.parse({ question: 'x', maxSources: 7 }),
    ).not.toThrow();
  });

  it('invokes the Web Research Agent with the focused prompt and preserves structured output', async () => {
    const invoke = vi.fn().mockResolvedValue({
      structuredOutput: {
        status: 'success' as const,
        answer: 'The latest release added router handoff support.',
        usedSourceIds: ['source-1'],
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
      usedSourceIds: ['source-1'],
      sources: [{ id: 'source-1' }],
      citations: [{ label: '[1]' }],
      metadataSummary: {
        selectedModelId: expect.any(String),
      },
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
    expect(payload.metadataSummary?.selectedModelId).toEqual(expect.any(String));
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

    // Tool must succeed so the Router reads the error reason from content
    // rather than treating it as a transient failure to retry.
    expect(response.status).toBe('success');
    const payload = JSON.parse(response.content[0].text);
    // 'boom' does not match any not_configured pattern, so status is 'error'
    expect(payload.status).toBe('error');
    expect(payload.agentKind).toBe('web_research');
    expect(payload.agentName).toBe('Web Research Agent');
    expect(payload.handoffMode).toBe('standard');
    // Raw error must not leak into the user-facing answer
    expect(payload.answer).not.toBe('boom');
    expect(payload.metadata).toMatchObject({
      parentAgent: 'router-agent',
      childAgent: 'web-research-agent',
      handoffTool: 'invoke_web_research_agent',
      handoffMode: 'standard',
      rawValueType: 'undefined',
      rawError: 'boom',
    });
    expect(payload.metadataSummary?.selectedModelId).toEqual(expect.any(String));
  });
});

describe('streamInvokeWebResearchAgentTool', () => {
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
      answer: 'Tavily returned current web results.',
      usedSourceIds: ['source-1'],
    });

    const streamEvents = [
      {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockStartEvent',
          start: { type: 'toolUseStart', toolUseId, name: 'web_research' },
        },
      },
      {
        type: 'toolResultEvent',
        result: {
          toolUseId,
          status: 'success',
          content: [
            {
              text: JSON.stringify({
                query: 'latest AI trends',
                sources: [{ id: 'source-1', title: 'Example source' }],
                citations: [{ sourceId: 'source-1', label: '[1]' }],
                rawResultSummary: {
                  resultCount: 1,
                  hasAnswer: true,
                  hasRawContent: false,
                },
              }),
            },
          ],
        },
      },
    ];

    const stream = makeAgentStream(streamEvents, agentResult);
    const progress: unknown[] = [];

    const gen = streamInvokeWebResearchAgentTool(
      { question: 'What are the latest AI trends?' },
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
        const payload = JSON.parse(value.content[0].text);
        expect(payload.sources).toEqual([{ id: 'source-1', title: 'Example source' }]);
        expect(payload.citations).toEqual([{ sourceId: 'source-1', label: '[1]' }]);
        expect(payload.usedSourceIds).toEqual(['source-1']);
        expect(payload.metadataSummary).toMatchObject({
          sourceCount: 1,
          citationCount: 1,
          resultCount: 1,
          selectedModelId: expect.any(String),
        });
        break;
      }
      progress.push(value);
    }

    expect(progress).toEqual([
      { stage: 'web_research', status: 'running' },
      { stage: 'web_research', status: 'complete', durationMs: expect.any(Number) },
    ]);
  });

  it('includes inputTokens from modelMetadataEvent in subsequent progress events', async () => {
    const toolUseId = 'tool-tok';
    const agentResult = makeAgentResult({ status: 'success', answer: 'done' });

    const streamEvents = [
      {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelMetadataEvent',
          usage: { inputTokens: 42000, outputTokens: 300 },
        },
      },
      {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockStartEvent',
          start: { type: 'toolUseStart', toolUseId, name: 'strands_structured_output' },
        },
      },
      {
        type: 'toolResultEvent',
        result: { toolUseId, status: 'success', content: [] },
      },
    ];

    const stream = makeAgentStream(streamEvents, agentResult);
    const progress: unknown[] = [];

    const gen = streamInvokeWebResearchAgentTool(
      { question: 'Token count test' },
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

    expect(progress).toEqual([
      { stage: 'strands_structured_output', status: 'running', inputTokens: 42000 },
      {
        stage: 'strands_structured_output',
        status: 'complete',
        durationMs: expect.any(Number),
        inputTokens: 42000,
      },
    ]);
  });

  it('yields error status when sub-agent tool returns error', async () => {
    const toolUseId = 'tool-err';
    const agentResult = makeAgentResult({ status: 'success', answer: 'done' });

    const streamEvents = [
      {
        type: 'contentBlockEvent',
        contentBlock: { type: 'toolUseBlock', toolUseId, name: 'web_research' },
      },
      {
        type: 'toolResultEvent',
        result: { toolUseId, status: 'error', content: [] },
      },
    ];

    const stream = makeAgentStream(streamEvents, agentResult);
    const progress: unknown[] = [];

    const gen = streamInvokeWebResearchAgentTool(
      { question: 'Search for something' },
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
      expect.objectContaining({ stage: 'web_research', status: 'error' }),
    );
  });

  it('returns success payload when the sub-agent stream throws', async () => {
    const failingStream = {
      next: () => Promise.reject(new Error('web research failure')),
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    const gen = streamInvokeWebResearchAgentTool(
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
    // Tool must succeed so the Router reads the error reason from content
    // rather than treating it as a transient failure to retry.
    expect(value.status).toBe('success');
    const streamPayload = JSON.parse(value.content[0].text);
    // Raw error must not leak into the user-facing answer; it goes to metadata.rawError
    expect(streamPayload.answer).not.toContain('web research failure');
    expect(streamPayload.metadata?.rawError).toContain('web research failure');
  });
});

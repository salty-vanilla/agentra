import { describe, expect, it } from 'vitest';
import { executeInvokeWebResearchAgentTool } from '../../tools/invoke-web-research-agent.tool.js';

const VALID_INPUT = {
  question: 'What are the latest trends in AI?',
};

const TAVILY_KEY_MISSING_ERROR =
  'TAVILY_API_KEY_SECRET_ID or TAVILY_API_KEY_SSM_NAME env var is not set.';

describe('executeInvokeWebResearchAgentTool', () => {
  it('returns success status with handoff payload on successful agent invocation', async () => {
    const mockOutput = {
      status: 'success',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'standard',
      answer: 'AI trends include LLMs and multimodal models.',
      sources: [],
      citations: [],
    };

    const result = await executeInvokeWebResearchAgentTool(VALID_INPUT, {
      agentFactory: () => ({
        invoke: async () => ({
          structuredOutput: mockOutput,
          toString: () => JSON.stringify(mockOutput),
        }),
      }),
    });

    expect(result.status).toBe('success');
    const parsed: unknown = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed).toMatchObject({ status: 'success', answer: expect.any(String) });
  });

  it('returns success status with error handoff payload when agent throws', async () => {
    const result = await executeInvokeWebResearchAgentTool(VALID_INPUT, {
      agentFactory: () => ({
        invoke: async () => {
          throw new Error(TAVILY_KEY_MISSING_ERROR);
        },
      }),
    });

    // Tool execution itself must succeed so the Router can read the error reason
    // from the content, rather than treating it as a transient retry-able failure.
    expect(result.status).toBe('success');
    const parsed: unknown = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed).toMatchObject({
      status: 'error',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      answer: expect.stringContaining('TAVILY_API_KEY'),
    });
  });

  it('returns success status with error handoff payload when agent factory throws', async () => {
    const result = await executeInvokeWebResearchAgentTool(VALID_INPUT, {
      agentFactory: () => {
        throw new Error('Agent creation failed');
      },
    });

    expect(result.status).toBe('success');
    const parsed: unknown = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed).toMatchObject({
      status: 'error',
      agentKind: 'web_research',
      answer: expect.stringContaining('Agent creation failed'),
    });
  });

  it('sets freshnessRequired mode in handoff metadata', async () => {
    const result = await executeInvokeWebResearchAgentTool(
      { ...VALID_INPUT, freshnessRequired: true },
      {
        agentFactory: () => ({
          invoke: async () => {
            throw new Error('fail');
          },
        }),
      },
    );

    expect(result.status).toBe('success');
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
      handoffMode?: string;
      metadata?: { handoffMode?: string };
    };
    expect(parsed.handoffMode ?? parsed.metadata?.handoffMode).toBe('freshness_required');
  });
});

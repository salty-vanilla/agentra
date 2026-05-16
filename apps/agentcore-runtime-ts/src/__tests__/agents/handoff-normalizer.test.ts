import { describe, expect, it } from 'vitest';
import { normalizeSubAgentHandoffOutput } from '../../agents/handoff-normalizer.js';

describe('sub-agent handoff normalizer', () => {
  it('preserves structured output and fills standard metadata', () => {
    const output = normalizeSubAgentHandoffOutput({
      value: {
        status: 'success',
        answer: 'Structured response',
        citations: [{ sourceId: 'doc-1' }],
        metadata: {
          confidence: 'high',
        },
      },
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: 'diagnostics',
      fallbackErrorMessage: 'fallback',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        traceId: 'trace-123',
      },
    });

    expect(output).toEqual({
      status: 'success',
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: 'diagnostics',
      answer: 'Structured response',
      citations: [{ sourceId: 'doc-1' }],
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        traceId: 'trace-123',
        confidence: 'high',
      },
    });
  });

  it('converts a plain string result into a success payload', () => {
    const output = normalizeSubAgentHandoffOutput({
      value: '  Plain string answer  ',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'freshness_required',
      fallbackErrorMessage: 'fallback',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
      },
    });

    expect(output).toEqual({
      status: 'success',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'freshness_required',
      answer: 'Plain string answer',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        rawValueType: 'string',
        rawValuePreview: 'Plain string answer',
      },
    });
  });

  it('returns a normalized error payload for invalid values', () => {
    const output = normalizeSubAgentHandoffOutput({
      value: { ok: false },
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      fallbackErrorMessage:
        'Manufacturing Line Agent did not return a usable handoff payload.',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
      },
    });

    expect(output).toEqual({
      status: 'error',
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      answer: 'Manufacturing Line Agent did not return a usable handoff payload.',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        rawValueType: 'object',
      },
    });
  });

  it('parses a JSON string value as a structured handoff output', () => {
    const jsonValue = JSON.stringify({
      status: 'success',
      answer: 'The answer from JSON string',
      sources: [{ url: 'https://example.com' }],
      citations: [{ label: '[1]' }],
    });

    const output = normalizeSubAgentHandoffOutput({
      value: jsonValue,
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'standard',
      fallbackErrorMessage: 'fallback',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
      },
    });

    expect(output).toEqual({
      status: 'success',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'standard',
      answer: 'The answer from JSON string',
      sources: [{ url: 'https://example.com' }],
      citations: [{ label: '[1]' }],
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        rawValueType: 'string_json',
      },
    });
  });

  it('extracts and parses JSON wrapped in a markdown code fence', () => {
    const fencedJson = [
      '```json',
      JSON.stringify({
        status: 'success',
        answer: 'The answer from fenced JSON',
        caveats: ['Freshness: results as of today'],
      }),
      '```',
    ].join('\n');

    const output = normalizeSubAgentHandoffOutput({
      value: fencedJson,
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'freshness_required',
      fallbackErrorMessage: 'fallback',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
      },
    });

    expect(output).toEqual({
      status: 'success',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'freshness_required',
      answer: 'The answer from fenced JSON',
      caveats: ['Freshness: results as of today'],
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        rawValueType: 'string_json',
      },
    });
  });

  it('falls back to plain string when JSON string does not satisfy the handoff schema', () => {
    const output = normalizeSubAgentHandoffOutput({
      value: '{"not_a_valid_field": true}',
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: 'standard',
      fallbackErrorMessage: 'fallback',
    });

    expect(output.status).toBe('success');
    expect(output.answer).toBe('{"not_a_valid_field": true}');
    expect(output.metadata?.rawValueType).toBe('string');
  });
});

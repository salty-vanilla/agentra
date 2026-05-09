import { describe, expect, it } from 'vitest';
import { buildRouterPrompt } from '../../../agents/router/prompt.js';

describe('Router prompt', () => {
  it('keeps the router focused on handoffs instead of direct RAG workflows', () => {
    const prompt = buildRouterPrompt({
      tone: 'business',
      userPrompt: 'Router policy check',
    });

    expect(prompt).toContain('invoke_manufacturing_line_agent');
    expect(prompt).toContain('invoke_web_research_agent');
    expect(prompt).toContain('create_slide_presentation');
    expect(prompt).toContain(
      'Router は通常KB RAG、構造化RAG、Tavily系ツールを直接使わず、必要な専門Agentへ委譲してください。',
    );
    expect(prompt).not.toContain('kb_retrieve で根拠を取得');
    expect(prompt).not.toContain('kb_query_readiness を使って');
    expect(prompt).not.toContain('structured_rag_flow を使い');
    expect(prompt).not.toContain('structured_answer_synthesis を使い');
    expect(prompt).not.toContain('tavily_search を使って');
    expect(prompt).not.toContain('tavily_extract を使って');
    expect(prompt).not.toContain('tavily_crawl を使って');
    expect(prompt).not.toContain('tavily_map を使って');
  });
});

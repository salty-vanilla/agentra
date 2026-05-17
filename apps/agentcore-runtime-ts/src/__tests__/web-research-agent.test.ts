import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEB_RESEARCH_SYSTEM_PROMPT } from '../agents/web-research/prompt.js';

describe('Web Research Agent module', () => {
  it('keeps public web research, citations, and freshness guidance in its prompt', () => {
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('Web Research Agent');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('public web search');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('source extraction');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('tavily_search');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('tavily_extract');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('tavily_crawl');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('tavily_map');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('date_resolver');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('normalize_evidence_source');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('build_citations');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('create_brief');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('freshness');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('caveats');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('manufacturing-line');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('Structured output rules');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('strands_structured_output');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('at most 5');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain('omit the snippet field');
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain(
      'do NOT call normalize_evidence_source or build_citations again',
    );
    expect(WEB_RESEARCH_SYSTEM_PROMPT).toContain(
      'Only call normalize_evidence_source and build_citations when using tavily_search or tavily_extract directly',
    );
  });

  it('builds a web research tool set with date normalization and direct Tavily tools enabled', async () => {
    const { buildWebResearchTools } = await import('../agents/web-research/tools.js');

    const names = buildWebResearchTools({
      enableTavily: true,
      enableWebResearch: true,
    }).map((tool) => tool.name);

    expect(names).toEqual([
      'date_resolver',
      'normalize_evidence_source',
      'build_citations',
      'create_brief',
      'merge_briefs',
      'web_research',
      'tavily_search',
      'tavily_extract',
      'tavily_crawl',
      'tavily_map',
    ]);
  });

  it('does not include manufacturing RAG or slide generation tools', async () => {
    const { buildWebResearchTools } = await import('../agents/web-research/tools.js');

    const names = buildWebResearchTools({
      enableTavily: true,
      enableEvidence: true,
      enableBrief: true,
      enableWebResearch: true,
    }).map((tool) => tool.name);

    expect(names).not.toContain('kb_retrieve');
    expect(names).not.toContain('kb_query_readiness');
    expect(names).not.toContain('kb_rag_diagnostics');
    expect(names).not.toContain('kb_answer_synthesis');
    expect(names).not.toContain('structured_rag_flow');
    expect(names).not.toContain('structured_query_plan');
    expect(names).not.toContain('create_slide_presentation');
  });

  it('provides a same-runtime factory without runtime split infrastructure', async () => {
    const agentModuleSource = await readFile(
      join(import.meta.dirname, '../agents/web-research/agent.ts'),
      'utf-8',
    );

    expect(agentModuleSource).toContain('createWebResearchAgent');
    expect(agentModuleSource).toContain('new Agent');
    expect(agentModuleSource).toContain('buildWebResearchTools');
    expect(agentModuleSource).not.toContain('BedrockAgentCoreApp');
    expect(agentModuleSource).not.toContain('InvokeAgentRuntime');
  });
});

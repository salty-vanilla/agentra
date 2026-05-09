import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANUFACTURING_LINE_SYSTEM_PROMPT } from '../agents/manufacturing-line/prompt.js';

describe('Manufacturing Line Agent module', () => {
  it('keeps manufacturing-specific RAG instructions in its prompt', () => {
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('Manufacturing Line Agent');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('structured RAG');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('normal KB RAG');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('metrics');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('aggregations');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('production trends');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('anomaly summaries');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('error-code lookup');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('equipment history');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('metadata.targetSignals');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('Do not present mock');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('citations');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('caveats');
    expect(MANUFACTURING_LINE_SYSTEM_PROMPT).toContain('next actions');
  });

  it('builds a manufacturing tool set with normal and structured RAG tools enabled', async () => {
    const { buildManufacturingLineTools } = await import(
      '../agents/manufacturing-line/tools.js'
    );

    const names = buildManufacturingLineTools({
      enableKbRetrieve: true,
      enableStructuredQueryExecuteBedrockStub: true,
    }).map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'kb_retrieve',
        'kb_rag_diagnostics',
        'kb_query_readiness',
        'kb_answer_synthesis',
        'structured_query_plan',
        'structured_plan_readiness',
        'structured_rag_flow',
        'structured_answer_synthesis',
        'bedrock_structured_poc_diagnostics',
        'structured_query_execute_mock',
        'structured_query_execute_bedrock_stub',
        'date_resolver',
        'calculator',
        'table_summary',
        'normalize_evidence_source',
        'build_citations',
        'create_brief',
        'merge_briefs',
      ]),
    );
  });

  it('does not include direct Tavily, slide generation, or separate runtime tools', async () => {
    const { buildManufacturingLineTools } = await import(
      '../agents/manufacturing-line/tools.js'
    );

    const names = buildManufacturingLineTools({
      enableKbRetrieve: true,
      enableTavily: true,
      enablePresentation: true,
      enableStructuredQueryExecuteBedrockStub: true,
    }).map((tool) => tool.name);

    expect(names).not.toContain('tavily_search');
    expect(names).not.toContain('tavily_extract');
    expect(names).not.toContain('tavily_crawl');
    expect(names).not.toContain('tavily_map');
    expect(names).not.toContain('create_slide_presentation');
    expect(names).not.toContain('InvokeAgentRuntime');
  });

  it('keeps Router behavior slim before the AGENT-3 handoff', async () => {
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');

    expect(agentSource).toContain('buildRouterTools');
    expect(agentSource).toContain('invoke_manufacturing_line_agent');
    expect(agentSource).not.toContain('equipment history lookup');
    expect(agentSource).not.toContain('production trend lookup');
    expect(agentSource).not.toContain('error-code lookup');
  });

  it('provides a same-runtime factory without runtime split infrastructure', async () => {
    const agentModuleSource = await readFile(
      join(import.meta.dirname, '../agents/manufacturing-line/agent.ts'),
      'utf-8',
    );

    expect(agentModuleSource).toContain('createManufacturingLineAgent');
    expect(agentModuleSource).toContain('new Agent');
    expect(agentModuleSource).toContain('buildManufacturingLineTools');
    expect(agentModuleSource).not.toContain('BedrockAgentCoreApp');
    expect(agentModuleSource).not.toContain('InvokeAgentRuntime');
  });
});

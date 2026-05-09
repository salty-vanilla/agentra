import { describe, expect, it } from 'vitest';
import { buildRouterTools } from '../../../agents/router/tools.js';

describe('Router tools', () => {
  it('stays limited to router-owned handoff and utility tools', () => {
    const names = buildRouterTools({
      enableArtifact: true,
      enableBrief: true,
      enableCalculator: true,
      enableKbAnswerSynthesis: true,
      enableKbQueryReadiness: true,
      enableKbRagDiagnostics: true,
      enableKbRagFlow: true,
      enableKbRetrieve: true,
      enableManufacturingLineAgentTool: true,
      enablePresentation: true,
      enableStructuredAnswerSynthesis: true,
      enableStructuredPlanReadiness: true,
      enableStructuredQueryExecuteBedrockStub: true,
      enableStructuredQueryExecuteMock: true,
      enableStructuredQueryPlan: true,
      enableStructuredRagFlow: true,
      enableTableSummary: true,
      enableTavily: true,
      enableWebResearch: true,
      enableWebResearchAgentTool: true,
    }).map((tool) => tool.name);

    expect(names).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'create_artifact_manifest',
      'create_brief',
      'merge_briefs',
      'invoke_manufacturing_line_agent',
      'invoke_web_research_agent',
      'create_slide_presentation',
    ]);
    expect(names).not.toContain('kb_retrieve');
    expect(names).not.toContain('kb_query_readiness');
    expect(names).not.toContain('kb_rag_diagnostics');
    expect(names).not.toContain('kb_rag_flow');
    expect(names).not.toContain('kb_answer_synthesis');
    expect(names).not.toContain('structured_query_plan');
    expect(names).not.toContain('structured_plan_readiness');
    expect(names).not.toContain('structured_rag_flow');
    expect(names).not.toContain('structured_answer_synthesis');
    expect(names).not.toContain('structured_query_execute_mock');
    expect(names).not.toContain('structured_query_execute_bedrock_stub');
    expect(names).not.toContain('web_research');
    expect(names).not.toContain('tavily_search');
    expect(names).not.toContain('tavily_extract');
    expect(names).not.toContain('tavily_crawl');
    expect(names).not.toContain('tavily_map');
    expect(names).not.toContain('getWeather');
  });
});

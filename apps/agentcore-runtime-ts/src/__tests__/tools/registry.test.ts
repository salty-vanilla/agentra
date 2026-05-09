import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('tool registry', () => {
  const originalEnv = {
    ENABLE_ARTIFACT_TOOLS: process.env.ENABLE_ARTIFACT_TOOLS,
    ENABLE_BRIEF_TOOLS: process.env.ENABLE_BRIEF_TOOLS,
    ENABLE_KB_RETRIEVE_TOOL: process.env.ENABLE_KB_RETRIEVE_TOOL,
    ENABLE_KB_QUERY_READINESS_TOOL: process.env.ENABLE_KB_QUERY_READINESS_TOOL,
    ENABLE_KB_RAG_DIAGNOSTICS_TOOL: process.env.ENABLE_KB_RAG_DIAGNOSTICS_TOOL,
    ENABLE_KB_ANSWER_SYNTHESIS_TOOL: process.env.ENABLE_KB_ANSWER_SYNTHESIS_TOOL,
    ENABLE_STRUCTURED_QUERY_PLAN_TOOL: process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL,
    ENABLE_STRUCTURED_PLAN_READINESS_TOOL:
      process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL,
    ENABLE_STRUCTURED_RAG_FLOW_TOOL: process.env.ENABLE_STRUCTURED_RAG_FLOW_TOOL,
    ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL:
      process.env.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL,
    ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL:
      process.env.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL,
    ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL:
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL,
    ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL:
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL,
    ENABLE_MANUFACTURING_LINE_AGENT_TOOL:
      process.env.ENABLE_MANUFACTURING_LINE_AGENT_TOOL,
    ENABLE_WEB_RESEARCH_AGENT_TOOL: process.env.ENABLE_WEB_RESEARCH_AGENT_TOOL,
    ENABLE_EVIDENCE_TOOLS: process.env.ENABLE_EVIDENCE_TOOLS,
    ENABLE_TAVILY_TOOLS: process.env.ENABLE_TAVILY_TOOLS,
    ENABLE_PRESENTATION_TOOL: process.env.ENABLE_PRESENTATION_TOOL,
    ENABLE_WEB_RESEARCH_TOOL: process.env.ENABLE_WEB_RESEARCH_TOOL,
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.ENABLE_ARTIFACT_TOOLS = originalEnv.ENABLE_ARTIFACT_TOOLS;
    process.env.ENABLE_BRIEF_TOOLS = originalEnv.ENABLE_BRIEF_TOOLS;
    process.env.ENABLE_KB_RETRIEVE_TOOL = originalEnv.ENABLE_KB_RETRIEVE_TOOL;
    process.env.ENABLE_KB_QUERY_READINESS_TOOL =
      originalEnv.ENABLE_KB_QUERY_READINESS_TOOL;
    process.env.ENABLE_KB_RAG_DIAGNOSTICS_TOOL =
      originalEnv.ENABLE_KB_RAG_DIAGNOSTICS_TOOL;
    process.env.ENABLE_KB_ANSWER_SYNTHESIS_TOOL =
      originalEnv.ENABLE_KB_ANSWER_SYNTHESIS_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_PLAN_TOOL;
    process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL =
      originalEnv.ENABLE_STRUCTURED_PLAN_READINESS_TOOL;
    process.env.ENABLE_STRUCTURED_RAG_FLOW_TOOL =
      originalEnv.ENABLE_STRUCTURED_RAG_FLOW_TOOL;
    process.env.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL =
      originalEnv.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL;
    process.env.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL =
      originalEnv.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL;
    process.env.ENABLE_MANUFACTURING_LINE_AGENT_TOOL =
      originalEnv.ENABLE_MANUFACTURING_LINE_AGENT_TOOL;
    process.env.ENABLE_WEB_RESEARCH_AGENT_TOOL =
      originalEnv.ENABLE_WEB_RESEARCH_AGENT_TOOL;
    process.env.ENABLE_EVIDENCE_TOOLS = originalEnv.ENABLE_EVIDENCE_TOOLS;
    process.env.ENABLE_TAVILY_TOOLS = originalEnv.ENABLE_TAVILY_TOOLS;
    process.env.ENABLE_PRESENTATION_TOOL = originalEnv.ENABLE_PRESENTATION_TOOL;
    process.env.ENABLE_WEB_RESEARCH_TOOL = originalEnv.ENABLE_WEB_RESEARCH_TOOL;
    process.env.BEDROCK_KB_ID = originalEnv.BEDROCK_KB_ID;
  });

  afterEach(() => {
    if (originalEnv.ENABLE_ARTIFACT_TOOLS === undefined) {
      delete process.env.ENABLE_ARTIFACT_TOOLS;
    } else {
      process.env.ENABLE_ARTIFACT_TOOLS = originalEnv.ENABLE_ARTIFACT_TOOLS;
    }

    if (originalEnv.ENABLE_BRIEF_TOOLS === undefined) {
      delete process.env.ENABLE_BRIEF_TOOLS;
    } else {
      process.env.ENABLE_BRIEF_TOOLS = originalEnv.ENABLE_BRIEF_TOOLS;
    }

    if (originalEnv.ENABLE_KB_RETRIEVE_TOOL === undefined) {
      delete process.env.ENABLE_KB_RETRIEVE_TOOL;
    } else {
      process.env.ENABLE_KB_RETRIEVE_TOOL = originalEnv.ENABLE_KB_RETRIEVE_TOOL;
    }

    if (originalEnv.ENABLE_KB_QUERY_READINESS_TOOL === undefined) {
      delete process.env.ENABLE_KB_QUERY_READINESS_TOOL;
    } else {
      process.env.ENABLE_KB_QUERY_READINESS_TOOL =
        originalEnv.ENABLE_KB_QUERY_READINESS_TOOL;
    }

    if (originalEnv.ENABLE_KB_RAG_DIAGNOSTICS_TOOL === undefined) {
      delete process.env.ENABLE_KB_RAG_DIAGNOSTICS_TOOL;
    } else {
      process.env.ENABLE_KB_RAG_DIAGNOSTICS_TOOL =
        originalEnv.ENABLE_KB_RAG_DIAGNOSTICS_TOOL;
    }

    if (originalEnv.ENABLE_KB_ANSWER_SYNTHESIS_TOOL === undefined) {
      delete process.env.ENABLE_KB_ANSWER_SYNTHESIS_TOOL;
    } else {
      process.env.ENABLE_KB_ANSWER_SYNTHESIS_TOOL =
        originalEnv.ENABLE_KB_ANSWER_SYNTHESIS_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_QUERY_PLAN_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL =
        originalEnv.ENABLE_STRUCTURED_QUERY_PLAN_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_PLAN_READINESS_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL =
        originalEnv.ENABLE_STRUCTURED_PLAN_READINESS_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_RAG_FLOW_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_RAG_FLOW_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_RAG_FLOW_TOOL =
        originalEnv.ENABLE_STRUCTURED_RAG_FLOW_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL =
        originalEnv.ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL;
    }

    if (originalEnv.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL === undefined) {
      delete process.env.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL;
    } else {
      process.env.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL =
        originalEnv.ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL =
        originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL;
    }

    if (originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL === undefined) {
      delete process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL;
    } else {
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL =
        originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL;
    }

    if (originalEnv.ENABLE_MANUFACTURING_LINE_AGENT_TOOL === undefined) {
      delete process.env.ENABLE_MANUFACTURING_LINE_AGENT_TOOL;
    } else {
      process.env.ENABLE_MANUFACTURING_LINE_AGENT_TOOL =
        originalEnv.ENABLE_MANUFACTURING_LINE_AGENT_TOOL;
    }

    if (originalEnv.ENABLE_WEB_RESEARCH_AGENT_TOOL === undefined) {
      delete process.env.ENABLE_WEB_RESEARCH_AGENT_TOOL;
    } else {
      process.env.ENABLE_WEB_RESEARCH_AGENT_TOOL =
        originalEnv.ENABLE_WEB_RESEARCH_AGENT_TOOL;
    }

    if (originalEnv.ENABLE_EVIDENCE_TOOLS === undefined) {
      delete process.env.ENABLE_EVIDENCE_TOOLS;
    } else {
      process.env.ENABLE_EVIDENCE_TOOLS = originalEnv.ENABLE_EVIDENCE_TOOLS;
    }

    if (originalEnv.ENABLE_TAVILY_TOOLS === undefined) {
      delete process.env.ENABLE_TAVILY_TOOLS;
    } else {
      process.env.ENABLE_TAVILY_TOOLS = originalEnv.ENABLE_TAVILY_TOOLS;
    }

    if (originalEnv.ENABLE_PRESENTATION_TOOL === undefined) {
      delete process.env.ENABLE_PRESENTATION_TOOL;
    } else {
      process.env.ENABLE_PRESENTATION_TOOL = originalEnv.ENABLE_PRESENTATION_TOOL;
    }

    if (originalEnv.ENABLE_WEB_RESEARCH_TOOL === undefined) {
      delete process.env.ENABLE_WEB_RESEARCH_TOOL;
    } else {
      process.env.ENABLE_WEB_RESEARCH_TOOL = originalEnv.ENABLE_WEB_RESEARCH_TOOL;
    }

    if (originalEnv.BEDROCK_KB_ID === undefined) {
      delete process.env.BEDROCK_KB_ID;
    } else {
      process.env.BEDROCK_KB_ID = originalEnv.BEDROCK_KB_ID;
    }
  });

  it('uses defaults for the tool registry', async () => {
    vi.stubEnv('BEDROCK_KB_ID', '');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const mod = await import('../../tools/registry.js');
    const config = mod.resolveToolRegistryConfigFromEnv();

    expect(config).toEqual({
      enableTavily: true,
      enablePresentation: true,
      enableCalculator: true,
      enableTableSummary: true,
      enableEvidence: true,
      enableArtifact: true,
      enableBrief: true,
      enableKbRetrieve: false,
      enableKbQueryReadiness: true,
      enableKbRagDiagnostics: true,
      enableKbAnswerSynthesis: true,
      enableStructuredQueryPlan: true,
      enableStructuredPlanReadiness: true,
      enableStructuredRagFlow: true,
      enableStructuredAnswerSynthesis: true,
      enableBedrockStructuredPocDiagnostics: true,
      enableStructuredQueryExecuteMock: true,
      enableStructuredQueryExecuteBedrockStub: false,
      enableWebResearchAgentTool: true,
      enableManufacturingLineAgentTool: true,
      enableWebResearch: true,
    });

    const names = mod.getRegisteredTools().map((entry) => ({
      name: entry.name,
      enabled: entry.enabled,
    }));

    expect(names).toEqual([
      { name: 'date_resolver', enabled: true },
      { name: 'calculator', enabled: true },
      { name: 'table_summary', enabled: true },
      { name: 'normalize_evidence_source', enabled: true },
      { name: 'build_citations', enabled: true },
      { name: 'create_artifact_manifest', enabled: true },
      { name: 'create_brief', enabled: true },
      { name: 'merge_briefs', enabled: true },
      { name: 'invoke_manufacturing_line_agent', enabled: true },
      { name: 'invoke_web_research_agent', enabled: true },
      { name: 'kb_retrieve', enabled: false },
      { name: 'kb_query_readiness', enabled: true },
      { name: 'kb_rag_diagnostics', enabled: true },
      { name: 'kb_answer_synthesis', enabled: true },
      { name: 'structured_query_plan', enabled: true },
      { name: 'structured_plan_readiness', enabled: true },
      { name: 'structured_rag_flow', enabled: true },
      { name: 'structured_answer_synthesis', enabled: true },
      { name: 'bedrock_structured_poc_diagnostics', enabled: true },
      { name: 'structured_query_execute_mock', enabled: true },
      { name: 'structured_query_execute_bedrock_stub', enabled: false },
      { name: 'web_research', enabled: true },
      { name: 'tavily_search', enabled: true },
      { name: 'tavily_extract', enabled: true },
      { name: 'tavily_crawl', enabled: true },
      { name: 'tavily_map', enabled: true },
      { name: 'create_slide_presentation', enabled: true },
    ]);
  });

  it('honors env flags and preserves tool order', async () => {
    vi.stubEnv('ENABLE_ARTIFACT_TOOLS', 'false');
    vi.stubEnv('ENABLE_BRIEF_TOOLS', 'false');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'false');
    vi.stubEnv('ENABLE_EVIDENCE_TOOLS', 'false');
    vi.stubEnv('ENABLE_TAVILY_TOOLS', 'false');
    vi.stubEnv('ENABLE_WEB_RESEARCH_TOOL', 'true');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();
    const enabledTools = mod.buildGeneralTools();
    const enabledNames = enabledTools.map((entry) => entry.name);

    expect(registered.find((entry) => entry.name === 'tavily_search')?.enabled).toBe(
      false,
    );
    expect(registered.find((entry) => entry.name === 'web_research')?.enabled).toBe(
      false,
    );
    expect(
      registered.find((entry) => entry.name === 'normalize_evidence_source')?.enabled,
    ).toBe(false);
    expect(registered.find((entry) => entry.name === 'build_citations')?.enabled).toBe(
      false,
    );
    expect(
      registered.find((entry) => entry.name === 'create_artifact_manifest')?.enabled,
    ).toBe(false);
    expect(registered.find((entry) => entry.name === 'create_brief')?.enabled).toBe(
      false,
    );
    expect(registered.find((entry) => entry.name === 'merge_briefs')?.enabled).toBe(
      false,
    );
    expect(registered.find((entry) => entry.name === 'kb_retrieve')?.enabled).toBe(false);
    expect(registered.find((entry) => entry.name === 'kb_query_readiness')?.enabled).toBe(
      true,
    );
    expect(registered.find((entry) => entry.name === 'kb_rag_diagnostics')?.enabled).toBe(
      true,
    );
    expect(enabledTools).toHaveLength(6);
    expect(enabledNames).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'invoke_manufacturing_line_agent',
      'invoke_web_research_agent',
      'create_slide_presentation',
    ]);
    expect(registered.map((entry) => entry.name)).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'normalize_evidence_source',
      'build_citations',
      'create_artifact_manifest',
      'create_brief',
      'merge_briefs',
      'invoke_manufacturing_line_agent',
      'invoke_web_research_agent',
      'kb_retrieve',
      'kb_query_readiness',
      'kb_rag_diagnostics',
      'kb_answer_synthesis',
      'structured_query_plan',
      'structured_plan_readiness',
      'structured_rag_flow',
      'structured_answer_synthesis',
      'bedrock_structured_poc_diagnostics',
      'structured_query_execute_mock',
      'structured_query_execute_bedrock_stub',
      'web_research',
      'tavily_search',
      'tavily_extract',
      'tavily_crawl',
      'tavily_map',
      'create_slide_presentation',
    ]);
  });

  it('builds a slim router tool set and keeps buildGeneralTools as a wrapper', async () => {
    const mod = await import('../../tools/registry.js');
    const config = {
      enableTavily: true,
      enablePresentation: true,
      enableCalculator: true,
      enableTableSummary: true,
      enableEvidence: true,
      enableArtifact: true,
      enableBrief: true,
      enableKbRetrieve: true,
      enableKbQueryReadiness: true,
      enableKbRagDiagnostics: true,
      enableKbAnswerSynthesis: true,
      enableStructuredQueryPlan: true,
      enableStructuredPlanReadiness: true,
      enableStructuredRagFlow: true,
      enableStructuredAnswerSynthesis: true,
      enableBedrockStructuredPocDiagnostics: true,
      enableStructuredQueryExecuteMock: true,
      enableStructuredQueryExecuteBedrockStub: true,
      enableWebResearch: true,
    };

    const routerNames = mod.buildRouterTools(config).map((entry) => entry.name);

    expect(routerNames).toEqual([
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
    expect(routerNames).not.toContain('kb_retrieve');
    expect(routerNames).not.toContain('kb_rag_flow');
    expect(routerNames).not.toContain('structured_rag_flow');
    expect(routerNames).not.toContain('web_research');
    expect(routerNames).not.toContain('tavily_search');
    expect(mod.buildGeneralTools(config).map((entry) => entry.name)).toEqual(routerNames);
  });

  it('builds manufacturing line tools with rag and structured rag enabled', async () => {
    const mod = await import('../../tools/registry.js');

    const names = mod
      .buildManufacturingLineTools({
        enableKbRetrieve: true,
        enableStructuredQueryExecuteBedrockStub: true,
      })
      .map((entry) => entry.name);

    expect(names).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'normalize_evidence_source',
      'build_citations',
      'create_brief',
      'merge_briefs',
      'kb_retrieve',
      'kb_query_readiness',
      'kb_rag_diagnostics',
      'kb_answer_synthesis',
      'structured_query_plan',
      'structured_plan_readiness',
      'structured_rag_flow',
      'structured_answer_synthesis',
      'bedrock_structured_poc_diagnostics',
      'structured_query_execute_mock',
      'structured_query_execute_bedrock_stub',
    ]);
  });

  it('builds web research tools with web research and direct Tavily tools enabled', async () => {
    const mod = await import('../../tools/registry.js');

    const names = mod
      .buildWebResearchTools({
        enableTavily: true,
        enableWebResearch: true,
      })
      .map((entry) => entry.name);

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

  it('builds presentation handoff tools', async () => {
    const mod = await import('../../tools/registry.js');

    expect(mod.buildPresentationHandoffTools().map((entry) => entry.name)).toEqual([
      'create_artifact_manifest',
      'create_slide_presentation',
    ]);
  });

  it('keeps per-agent builders deterministic when env flags disable tools', async () => {
    vi.stubEnv('ENABLE_TAVILY_TOOLS', 'false');
    vi.stubEnv('ENABLE_PRESENTATION_TOOL', 'false');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'false');
    vi.stubEnv('ENABLE_STRUCTURED_RAG_FLOW_TOOL', 'false');
    vi.stubEnv('ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL', 'false');

    const mod = await import('../../tools/registry.js');

    expect(mod.buildWebResearchTools().map((entry) => entry.name)).toEqual([
      'date_resolver',
      'normalize_evidence_source',
      'build_citations',
      'create_brief',
      'merge_briefs',
    ]);
    expect(mod.buildPresentationHandoffTools().map((entry) => entry.name)).toEqual([
      'create_artifact_manifest',
    ]);
    expect(mod.buildManufacturingLineTools().map((entry) => entry.name)).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'normalize_evidence_source',
      'build_citations',
      'create_brief',
      'merge_briefs',
      'kb_query_readiness',
      'kb_rag_diagnostics',
      'kb_answer_synthesis',
      'structured_query_plan',
      'structured_plan_readiness',
      'structured_answer_synthesis',
      'bedrock_structured_poc_diagnostics',
    ]);
  });

  it('disables web research independently when the feature flag is off', async () => {
    vi.stubEnv('ENABLE_WEB_RESEARCH_TOOL', 'false');
    vi.stubEnv('ENABLE_TAVILY_TOOLS', 'true');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(registered.find((entry) => entry.name === 'web_research')?.enabled).toBe(
      false,
    );
    expect(registered.find((entry) => entry.name === 'tavily_search')?.enabled).toBe(
      true,
    );
  });

  it('disables the web research agent handoff independently when the feature flag is off', async () => {
    vi.stubEnv('ENABLE_WEB_RESEARCH_AGENT_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();
    const routerNames = mod.buildRouterTools().map((entry) => entry.name);

    expect(mod.resolveToolRegistryConfigFromEnv().enableWebResearchAgentTool).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'invoke_web_research_agent')?.enabled,
    ).toBe(false);
    expect(routerNames).not.toContain('invoke_web_research_agent');
  });

  it('disables the manufacturing line agent handoff independently when the feature flag is off', async () => {
    vi.stubEnv('ENABLE_MANUFACTURING_LINE_AGENT_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();
    const routerNames = mod.buildRouterTools().map((entry) => entry.name);

    expect(mod.resolveToolRegistryConfigFromEnv().enableManufacturingLineAgentTool).toBe(
      false,
    );
    expect(
      registered.find((entry) => entry.name === 'invoke_manufacturing_line_agent')
        ?.enabled,
    ).toBe(false);
    expect(routerNames).not.toContain('invoke_manufacturing_line_agent');
  });

  it('enables kb retrieve by default when BEDROCK_KB_ID is set', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-123');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableKbRetrieve).toBe(true);
    expect(registered.find((entry) => entry.name === 'kb_retrieve')?.enabled).toBe(true);
    expect(registered.find((entry) => entry.name === 'kb_query_readiness')?.enabled).toBe(
      true,
    );
    expect(
      registered.find((entry) => entry.name === 'structured_query_plan')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_plan_readiness')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_rag_flow')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_answer_synthesis')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'kb_answer_synthesis')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'bedrock_structured_poc_diagnostics')
        ?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'invoke_manufacturing_line_agent')
        ?.enabled,
    ).toBe(true);
  });

  it('disables kb retrieve when the feature flag is false even with BEDROCK_KB_ID', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-123');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableKbRetrieve).toBe(false);
    expect(registered.find((entry) => entry.name === 'kb_retrieve')?.enabled).toBe(false);
    expect(registered.find((entry) => entry.name === 'kb_query_readiness')?.enabled).toBe(
      true,
    );
    expect(
      registered.find((entry) => entry.name === 'structured_query_plan')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_plan_readiness')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_rag_flow')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_answer_synthesis')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'kb_answer_synthesis')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'bedrock_structured_poc_diagnostics')
        ?.enabled,
    ).toBe(true);
  });

  it('disables structured query plan when the feature flag is false', async () => {
    vi.stubEnv('ENABLE_STRUCTURED_QUERY_PLAN_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableStructuredQueryPlan).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'structured_query_plan')?.enabled,
    ).toBe(false);
  });

  it('disables structured query execute mock when the feature flag is false', async () => {
    vi.stubEnv('ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableStructuredQueryExecuteMock).toBe(
      false,
    );
    expect(
      registered.find((entry) => entry.name === 'structured_query_execute_mock')?.enabled,
    ).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'structured_query_execute_bedrock_stub')
        ?.enabled,
    ).toBe(false);
  });

  it('disables structured rag flow when the feature flag is false', async () => {
    vi.stubEnv('ENABLE_STRUCTURED_RAG_FLOW_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableStructuredRagFlow).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'structured_rag_flow')?.enabled,
    ).toBe(false);
  });

  it('disables structured answer synthesis when the feature flag is false', async () => {
    vi.stubEnv('ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableStructuredAnswerSynthesis).toBe(
      false,
    );
    expect(
      registered.find((entry) => entry.name === 'structured_answer_synthesis')?.enabled,
    ).toBe(false);
  });

  it('disables bedrock structured poc diagnostics when the feature flag is false', async () => {
    vi.stubEnv('ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(
      mod.resolveToolRegistryConfigFromEnv().enableBedrockStructuredPocDiagnostics,
    ).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'bedrock_structured_poc_diagnostics')
        ?.enabled,
    ).toBe(false);
  });
});

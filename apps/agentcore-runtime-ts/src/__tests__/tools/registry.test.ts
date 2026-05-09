import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('tool registry', () => {
  const originalEnv = {
    ENABLE_ARTIFACT_TOOLS: process.env.ENABLE_ARTIFACT_TOOLS,
    ENABLE_BRIEF_TOOLS: process.env.ENABLE_BRIEF_TOOLS,
    ENABLE_KB_RETRIEVE_TOOL: process.env.ENABLE_KB_RETRIEVE_TOOL,
    ENABLE_STRUCTURED_QUERY_PLAN_TOOL: process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL,
    ENABLE_STRUCTURED_PLAN_READINESS_TOOL:
      process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL,
    ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL:
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL,
    ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL:
      process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL,
    ENABLE_EVIDENCE_TOOLS: process.env.ENABLE_EVIDENCE_TOOLS,
    ENABLE_TAVILY_TOOLS: process.env.ENABLE_TAVILY_TOOLS,
    ENABLE_WEB_RESEARCH_TOOL: process.env.ENABLE_WEB_RESEARCH_TOOL,
    ENABLE_WEATHER_TOOL: process.env.ENABLE_WEATHER_TOOL,
    BEDROCK_KB_ID: process.env.BEDROCK_KB_ID,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.ENABLE_ARTIFACT_TOOLS = originalEnv.ENABLE_ARTIFACT_TOOLS;
    process.env.ENABLE_BRIEF_TOOLS = originalEnv.ENABLE_BRIEF_TOOLS;
    process.env.ENABLE_KB_RETRIEVE_TOOL = originalEnv.ENABLE_KB_RETRIEVE_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_PLAN_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_PLAN_TOOL;
    process.env.ENABLE_STRUCTURED_PLAN_READINESS_TOOL =
      originalEnv.ENABLE_STRUCTURED_PLAN_READINESS_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL;
    process.env.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL =
      originalEnv.ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL;
    process.env.ENABLE_EVIDENCE_TOOLS = originalEnv.ENABLE_EVIDENCE_TOOLS;
    process.env.ENABLE_TAVILY_TOOLS = originalEnv.ENABLE_TAVILY_TOOLS;
    process.env.ENABLE_WEB_RESEARCH_TOOL = originalEnv.ENABLE_WEB_RESEARCH_TOOL;
    process.env.ENABLE_WEATHER_TOOL = originalEnv.ENABLE_WEATHER_TOOL;
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

    if (originalEnv.ENABLE_WEB_RESEARCH_TOOL === undefined) {
      delete process.env.ENABLE_WEB_RESEARCH_TOOL;
    } else {
      process.env.ENABLE_WEB_RESEARCH_TOOL = originalEnv.ENABLE_WEB_RESEARCH_TOOL;
    }

    if (originalEnv.ENABLE_WEATHER_TOOL === undefined) {
      delete process.env.ENABLE_WEATHER_TOOL;
    } else {
      process.env.ENABLE_WEATHER_TOOL = originalEnv.ENABLE_WEATHER_TOOL;
    }

    if (originalEnv.BEDROCK_KB_ID === undefined) {
      delete process.env.BEDROCK_KB_ID;
    } else {
      process.env.BEDROCK_KB_ID = originalEnv.BEDROCK_KB_ID;
    }
  });

  it('uses defaults with weather disabled', async () => {
    vi.stubEnv('BEDROCK_KB_ID', '');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const mod = await import('../../tools/registry.js');
    const config = mod.resolveToolRegistryConfigFromEnv();

    expect(config).toEqual({
      enableWeather: false,
      enableTavily: true,
      enablePresentation: true,
      enableCalculator: true,
      enableTableSummary: true,
      enableEvidence: true,
      enableArtifact: true,
      enableBrief: true,
      enableKbRetrieve: false,
      enableStructuredQueryPlan: true,
      enableStructuredPlanReadiness: true,
      enableStructuredQueryExecuteMock: true,
      enableStructuredQueryExecuteBedrockStub: false,
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
      { name: 'kb_retrieve', enabled: false },
      { name: 'structured_query_plan', enabled: true },
      { name: 'structured_plan_readiness', enabled: true },
      { name: 'structured_query_execute_mock', enabled: true },
      { name: 'structured_query_execute_bedrock_stub', enabled: false },
      { name: 'web_research', enabled: true },
      { name: 'tavily_search', enabled: true },
      { name: 'tavily_extract', enabled: true },
      { name: 'tavily_crawl', enabled: true },
      { name: 'tavily_map', enabled: true },
      { name: 'create_slide_presentation', enabled: true },
      { name: 'getWeather', enabled: false },
    ]);
  });

  it('honors env flags and preserves tool order', async () => {
    vi.stubEnv('ENABLE_ARTIFACT_TOOLS', 'false');
    vi.stubEnv('ENABLE_BRIEF_TOOLS', 'false');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'false');
    vi.stubEnv('ENABLE_EVIDENCE_TOOLS', 'false');
    vi.stubEnv('ENABLE_TAVILY_TOOLS', 'false');
    vi.stubEnv('ENABLE_WEB_RESEARCH_TOOL', 'true');
    vi.stubEnv('ENABLE_WEATHER_TOOL', 'true');

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
    expect(registered.find((entry) => entry.name === 'getWeather')?.enabled).toBe(true);
    expect(enabledTools).toHaveLength(8);
    expect(enabledNames).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'structured_query_plan',
      'structured_plan_readiness',
      'structured_query_execute_mock',
      'create_slide_presentation',
      'getWeather',
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
      'kb_retrieve',
      'structured_query_plan',
      'structured_plan_readiness',
      'structured_query_execute_mock',
      'structured_query_execute_bedrock_stub',
      'web_research',
      'tavily_search',
      'tavily_extract',
      'tavily_crawl',
      'tavily_map',
      'create_slide_presentation',
      'getWeather',
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

  it('enables kb retrieve by default when BEDROCK_KB_ID is set', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-123');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableKbRetrieve).toBe(true);
    expect(registered.find((entry) => entry.name === 'kb_retrieve')?.enabled).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_query_plan')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_plan_readiness')?.enabled,
    ).toBe(true);
    expect(registered.find((entry) => entry.name === 'getWeather')?.enabled).toBe(false);
  });

  it('disables kb retrieve when the feature flag is false even with BEDROCK_KB_ID', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-123');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'false');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();

    expect(mod.resolveToolRegistryConfigFromEnv().enableKbRetrieve).toBe(false);
    expect(registered.find((entry) => entry.name === 'kb_retrieve')?.enabled).toBe(false);
    expect(
      registered.find((entry) => entry.name === 'structured_query_plan')?.enabled,
    ).toBe(true);
    expect(
      registered.find((entry) => entry.name === 'structured_plan_readiness')?.enabled,
    ).toBe(true);
    expect(registered.find((entry) => entry.name === 'getWeather')?.enabled).toBe(false);
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
});

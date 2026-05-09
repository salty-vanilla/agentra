import type { Tool } from '@strands-agents/sdk';
import { createArtifactManifestTool } from './artifact.tool.js';
import { bedrockStructuredPocDiagnosticsTool } from './bedrock-structured-poc-diagnostics.tool.js';
import { createBriefTool, mergeBriefsTool } from './brief.tool.js';
import { calculatorTool } from './calculator.tool.js';
import { createSlidePresentationTool } from './create-slide-presentation.js';
import { dateResolverTool } from './date-resolver.js';
import { buildCitationsTool, normalizeEvidenceSourceTool } from './evidence.tool.js';
import { invokeManufacturingLineAgentTool } from './invoke-manufacturing-line-agent.tool.js';
import { invokeWebResearchAgentTool } from './invoke-web-research-agent.tool.js';
import { kbAnswerSynthesisTool } from './kb-answer-synthesis.tool.js';
import { kbQueryReadinessTool } from './kb-query-readiness.tool.js';
import { kbRagDiagnosticsTool } from './kb-rag-diagnostics.tool.js';
import { kbRetrieveTool } from './kb-retrieve.tool.js';
import { structuredAnswerSynthesisTool } from './structured-answer-synthesis.tool.js';
import { structuredPlanReadinessTool } from './structured-plan-readiness.tool.js';
import { structuredQueryExecuteBedrockStubTool } from './structured-query-execute-bedrock-stub.tool.js';
import { structuredQueryExecuteMockTool } from './structured-query-execute-mock.tool.js';
import { structuredQueryPlanTool } from './structured-query-plan.tool.js';
import { structuredRagFlowTool } from './structured-rag-flow.tool.js';
import { tableSummaryTool } from './table-summary.tool.js';
import {
  tavilyCrawlTool,
  tavilyExtractTool,
  tavilyMapTool,
  tavilySearchTool,
} from './tavily.js';
import { webResearchTool } from './web-research.tool.js';

export type ToolCategory =
  | 'time'
  | 'web'
  | 'calculation'
  | 'evidence'
  | 'artifact'
  | 'brief'
  | 'rag'
  | 'structured_rag'
  | 'research'
  | 'presentation'
  | 'unknown';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type StrandsTool = Tool;

export type RegisteredTool = {
  name: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  enabled: boolean;
  tool: StrandsTool;
  description?: string;
};

export type ToolRegistryConfig = {
  enableManufacturingLineAgentTool?: boolean;
  enableTavily?: boolean;
  enablePresentation?: boolean;
  enableCalculator?: boolean;
  enableTableSummary?: boolean;
  enableEvidence?: boolean;
  enableArtifact?: boolean;
  enableBrief?: boolean;
  enableKbRetrieve?: boolean;
  enableKbQueryReadiness?: boolean;
  enableKbRagDiagnostics?: boolean;
  enableKbAnswerSynthesis?: boolean;
  enableStructuredQueryPlan?: boolean;
  enableStructuredPlanReadiness?: boolean;
  enableStructuredRagFlow?: boolean;
  enableStructuredAnswerSynthesis?: boolean;
  enableBedrockStructuredPocDiagnostics?: boolean;
  enableStructuredQueryExecuteMock?: boolean;
  enableStructuredQueryExecuteBedrockStub?: boolean;
  enableWebResearchAgentTool?: boolean;
  enableWebResearch?: boolean;
};

const TOOL_ORDER = [
  'date_resolver',
  'calculator',
  'table_summary',
  'normalize_evidence_source',
  'build_citations',
  'create_artifact_manifest',
  'create_brief',
  'merge_briefs',
  'invoke_manufacturing_line_agent',
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
  'invoke_web_research_agent',
  'web_research',
  'tavily_search',
  'tavily_extract',
  'tavily_crawl',
  'tavily_map',
  'create_slide_presentation',
] as const;

type RegisteredToolName = (typeof TOOL_ORDER)[number];

const ROUTER_TOOL_NAMES = [
  'date_resolver',
  'calculator',
  'table_summary',
  'create_brief',
  'merge_briefs',
  'create_artifact_manifest',
  'invoke_manufacturing_line_agent',
  'invoke_web_research_agent',
  'create_slide_presentation',
] as const satisfies readonly RegisteredToolName[];

const MANUFACTURING_LINE_TOOL_NAMES = [
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
] as const satisfies readonly RegisteredToolName[];

const WEB_RESEARCH_TOOL_NAMES = [
  'date_resolver',
  'web_research',
  'tavily_search',
  'tavily_extract',
  'tavily_crawl',
  'tavily_map',
  'normalize_evidence_source',
  'build_citations',
  'create_brief',
  'merge_briefs',
] as const satisfies readonly RegisteredToolName[];

const PRESENTATION_HANDOFF_TOOL_NAMES = [
  'create_slide_presentation',
  'create_artifact_manifest',
] as const satisfies readonly RegisteredToolName[];

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

function resolveEnvFlag(name: string, defaultValue: boolean): boolean {
  return parseBooleanEnv(process.env[name]) ?? defaultValue;
}

export function resolveToolRegistryConfigFromEnv(): ToolRegistryConfig {
  return {
    enableManufacturingLineAgentTool: resolveEnvFlag(
      'ENABLE_MANUFACTURING_LINE_AGENT_TOOL',
      true,
    ),
    enableTavily: resolveEnvFlag('ENABLE_TAVILY_TOOLS', true),
    enablePresentation: resolveEnvFlag('ENABLE_PRESENTATION_TOOL', true),
    enableCalculator: resolveEnvFlag('ENABLE_CALCULATOR_TOOL', true),
    enableTableSummary: resolveEnvFlag('ENABLE_TABLE_SUMMARY_TOOL', true),
    enableEvidence: resolveEnvFlag('ENABLE_EVIDENCE_TOOLS', true),
    enableArtifact: resolveEnvFlag('ENABLE_ARTIFACT_TOOLS', true),
    enableBrief: resolveEnvFlag('ENABLE_BRIEF_TOOLS', true),
    enableKbRetrieve: resolveEnvFlag(
      'ENABLE_KB_RETRIEVE_TOOL',
      Boolean(process.env.BEDROCK_KB_ID?.trim()),
    ),
    enableKbQueryReadiness: resolveEnvFlag('ENABLE_KB_QUERY_READINESS_TOOL', true),
    enableKbRagDiagnostics: resolveEnvFlag('ENABLE_KB_RAG_DIAGNOSTICS_TOOL', true),
    enableKbAnswerSynthesis: resolveEnvFlag('ENABLE_KB_ANSWER_SYNTHESIS_TOOL', true),
    enableStructuredQueryPlan: resolveEnvFlag('ENABLE_STRUCTURED_QUERY_PLAN_TOOL', true),
    enableStructuredPlanReadiness: resolveEnvFlag(
      'ENABLE_STRUCTURED_PLAN_READINESS_TOOL',
      true,
    ),
    enableStructuredRagFlow: resolveEnvFlag('ENABLE_STRUCTURED_RAG_FLOW_TOOL', true),
    enableStructuredAnswerSynthesis: resolveEnvFlag(
      'ENABLE_STRUCTURED_ANSWER_SYNTHESIS_TOOL',
      true,
    ),
    enableBedrockStructuredPocDiagnostics: resolveEnvFlag(
      'ENABLE_BEDROCK_STRUCTURED_POC_DIAGNOSTICS_TOOL',
      true,
    ),
    enableStructuredQueryExecuteMock: resolveEnvFlag(
      'ENABLE_STRUCTURED_QUERY_EXECUTE_MOCK_TOOL',
      true,
    ),
    enableStructuredQueryExecuteBedrockStub: resolveEnvFlag(
      'ENABLE_STRUCTURED_QUERY_EXECUTE_BEDROCK_STUB_TOOL',
      false,
    ),
    enableWebResearchAgentTool: resolveEnvFlag('ENABLE_WEB_RESEARCH_AGENT_TOOL', true),
    enableWebResearch: resolveEnvFlag('ENABLE_WEB_RESEARCH_TOOL', true),
  };
}

function resolveToolEnabled(
  config: ToolRegistryConfig,
  key: keyof ToolRegistryConfig,
  fallback: boolean,
): boolean {
  return config[key] ?? fallback;
}

export function getRegisteredTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): RegisteredTool[] {
  const enableManufacturingLineAgentTool = resolveToolEnabled(
    config,
    'enableManufacturingLineAgentTool',
    true,
  );
  const enableTavily = resolveToolEnabled(config, 'enableTavily', true);
  const enablePresentation = resolveToolEnabled(config, 'enablePresentation', true);
  const enableCalculator = resolveToolEnabled(config, 'enableCalculator', true);
  const enableTableSummary = resolveToolEnabled(config, 'enableTableSummary', true);
  const enableEvidence = resolveToolEnabled(config, 'enableEvidence', true);
  const enableArtifact = resolveToolEnabled(config, 'enableArtifact', true);
  const enableBrief = resolveToolEnabled(config, 'enableBrief', true);
  const enableKbRetrieve = resolveToolEnabled(config, 'enableKbRetrieve', false);
  const enableKbQueryReadiness = resolveToolEnabled(
    config,
    'enableKbQueryReadiness',
    true,
  );
  const enableKbRagDiagnostics = resolveToolEnabled(
    config,
    'enableKbRagDiagnostics',
    true,
  );
  const enableKbAnswerSynthesis = resolveToolEnabled(
    config,
    'enableKbAnswerSynthesis',
    true,
  );
  const enableStructuredQueryPlan = resolveToolEnabled(
    config,
    'enableStructuredQueryPlan',
    true,
  );
  const enableStructuredPlanReadiness = resolveToolEnabled(
    config,
    'enableStructuredPlanReadiness',
    true,
  );
  const enableStructuredRagFlow = resolveToolEnabled(
    config,
    'enableStructuredRagFlow',
    true,
  );
  const enableStructuredAnswerSynthesis = resolveToolEnabled(
    config,
    'enableStructuredAnswerSynthesis',
    true,
  );
  const enableBedrockStructuredPocDiagnostics = resolveToolEnabled(
    config,
    'enableBedrockStructuredPocDiagnostics',
    true,
  );
  const enableStructuredQueryExecuteMock = resolveToolEnabled(
    config,
    'enableStructuredQueryExecuteMock',
    true,
  );
  const enableStructuredQueryExecuteBedrockStub = resolveToolEnabled(
    config,
    'enableStructuredQueryExecuteBedrockStub',
    false,
  );
  const enableWebResearchAgentTool = resolveToolEnabled(
    config,
    'enableWebResearchAgentTool',
    true,
  );
  const enableWebResearch = resolveToolEnabled(config, 'enableWebResearch', true);

  const tools: RegisteredTool[] = [
    {
      name: 'date_resolver',
      category: 'time',
      riskLevel: 'low',
      enabled: true,
      tool: dateResolverTool,
    },
    {
      name: 'calculator',
      category: 'calculation',
      riskLevel: 'low',
      enabled: enableCalculator,
      tool: calculatorTool,
    },
    {
      name: 'table_summary',
      category: 'calculation',
      riskLevel: 'low',
      enabled: enableTableSummary,
      tool: tableSummaryTool,
    },
    {
      name: 'normalize_evidence_source',
      category: 'evidence',
      riskLevel: 'low',
      enabled: enableEvidence,
      tool: normalizeEvidenceSourceTool,
    },
    {
      name: 'build_citations',
      category: 'evidence',
      riskLevel: 'low',
      enabled: enableEvidence,
      tool: buildCitationsTool,
    },
    {
      name: 'create_artifact_manifest',
      category: 'artifact',
      riskLevel: 'low',
      enabled: enableArtifact,
      tool: createArtifactManifestTool,
    },
    {
      name: 'create_brief',
      category: 'brief',
      riskLevel: 'low',
      enabled: enableBrief,
      tool: createBriefTool,
    },
    {
      name: 'merge_briefs',
      category: 'brief',
      riskLevel: 'low',
      enabled: enableBrief,
      tool: mergeBriefsTool,
    },
    {
      name: 'invoke_manufacturing_line_agent',
      category: 'research',
      riskLevel: 'medium',
      enabled: enableManufacturingLineAgentTool,
      tool: invokeManufacturingLineAgentTool,
    },
    {
      name: 'invoke_web_research_agent',
      category: 'research',
      riskLevel: 'medium',
      enabled: enableWebResearchAgentTool,
      tool: invokeWebResearchAgentTool,
    },
    {
      name: 'kb_retrieve',
      category: 'rag',
      riskLevel: 'medium',
      enabled: enableKbRetrieve,
      tool: kbRetrieveTool,
    },
    {
      name: 'kb_query_readiness',
      category: 'rag',
      riskLevel: 'low',
      enabled: enableKbQueryReadiness,
      tool: kbQueryReadinessTool,
    },
    {
      name: 'kb_rag_diagnostics',
      category: 'rag',
      riskLevel: 'low',
      enabled: enableKbRagDiagnostics,
      tool: kbRagDiagnosticsTool,
    },
    {
      name: 'kb_answer_synthesis',
      category: 'rag',
      riskLevel: 'low',
      enabled: enableKbAnswerSynthesis,
      tool: kbAnswerSynthesisTool,
    },
    {
      name: 'structured_query_plan',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableStructuredQueryPlan,
      tool: structuredQueryPlanTool,
    },
    {
      name: 'structured_plan_readiness',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableStructuredPlanReadiness,
      tool: structuredPlanReadinessTool,
    },
    {
      name: 'structured_rag_flow',
      category: 'structured_rag',
      riskLevel: 'medium',
      enabled: enableStructuredRagFlow,
      tool: structuredRagFlowTool,
    },
    {
      name: 'structured_answer_synthesis',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableStructuredAnswerSynthesis,
      tool: structuredAnswerSynthesisTool,
    },
    {
      name: 'bedrock_structured_poc_diagnostics',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableBedrockStructuredPocDiagnostics,
      tool: bedrockStructuredPocDiagnosticsTool,
    },
    {
      name: 'structured_query_execute_mock',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableStructuredQueryExecuteMock,
      tool: structuredQueryExecuteMockTool,
    },
    {
      name: 'structured_query_execute_bedrock_stub',
      category: 'structured_rag',
      riskLevel: 'low',
      enabled: enableStructuredQueryExecuteBedrockStub,
      tool: structuredQueryExecuteBedrockStubTool,
    },
    {
      name: 'web_research',
      category: 'research',
      riskLevel: 'medium',
      enabled: enableWebResearch && enableTavily,
      tool: webResearchTool,
    },
    {
      name: 'tavily_search',
      category: 'web',
      riskLevel: 'high',
      enabled: enableTavily,
      tool: tavilySearchTool,
    },
    {
      name: 'tavily_extract',
      category: 'web',
      riskLevel: 'high',
      enabled: enableTavily,
      tool: tavilyExtractTool,
    },
    {
      name: 'tavily_crawl',
      category: 'web',
      riskLevel: 'high',
      enabled: enableTavily,
      tool: tavilyCrawlTool,
    },
    {
      name: 'tavily_map',
      category: 'web',
      riskLevel: 'high',
      enabled: enableTavily,
      tool: tavilyMapTool,
    },
    {
      name: 'create_slide_presentation',
      category: 'presentation',
      riskLevel: 'high',
      enabled: enablePresentation,
      tool: createSlidePresentationTool,
    },
  ];

  return tools;
}

function buildToolsByName(
  toolNames: readonly RegisteredToolName[],
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  const registeredTools = getRegisteredTools(config);
  const enabledTools = new Map(
    registeredTools.map((entry) => [entry.name, entry] as const),
  );
  const selectedToolNames = new Set(toolNames);

  return TOOL_ORDER.flatMap((toolName) => {
    if (!selectedToolNames.has(toolName)) {
      return [];
    }

    const entry = enabledTools.get(toolName);
    if (!entry?.enabled) {
      return [];
    }

    return [entry.tool];
  });
}

export function buildRouterTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  return buildToolsByName(ROUTER_TOOL_NAMES, config);
}

export function buildManufacturingLineTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  return buildToolsByName(MANUFACTURING_LINE_TOOL_NAMES, config);
}

export function buildWebResearchTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  return buildToolsByName(WEB_RESEARCH_TOOL_NAMES, config);
}

export function buildPresentationHandoffTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  return buildToolsByName(PRESENTATION_HANDOFF_TOOL_NAMES, config);
}

export function buildGeneralTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  return buildRouterTools(config);
}

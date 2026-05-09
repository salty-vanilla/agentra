import type { Tool } from '@strands-agents/sdk';
import {
  getRegisteredTools,
  resolveToolRegistryConfigFromEnv,
  type ToolRegistryConfig,
} from './registry.js';

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
  'kb_rag_flow',
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

export type RegisteredToolName = (typeof TOOL_ORDER)[number];

export type StrandsTool = Tool;

export function buildToolsByName(
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

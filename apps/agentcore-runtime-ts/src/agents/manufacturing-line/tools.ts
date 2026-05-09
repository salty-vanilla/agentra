import {
  resolveToolRegistryConfigFromEnv,
  type ToolRegistryConfig,
} from '../../tools/registry.js';
import { buildToolsByName, type RegisteredToolName } from '../../tools/tool-selection.js';

const MANUFACTURING_LINE_TOOL_NAMES = [
  'kb_retrieve',
  'kb_rag_diagnostics',
  'kb_query_readiness',
  'kb_rag_flow',
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

export function buildManufacturingLineTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
) {
  return buildToolsByName(MANUFACTURING_LINE_TOOL_NAMES, config);
}

export type { ToolRegistryConfig } from '../../tools/registry.js';

import {
  resolveToolRegistryConfigFromEnv,
  type ToolRegistryConfig,
} from '../../tools/registry.js';
import { buildToolsByName, type RegisteredToolName } from '../../tools/tool-selection.js';

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

export function buildRouterTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
) {
  return buildToolsByName(ROUTER_TOOL_NAMES, config);
}

export type { ToolRegistryConfig } from '../../tools/registry.js';

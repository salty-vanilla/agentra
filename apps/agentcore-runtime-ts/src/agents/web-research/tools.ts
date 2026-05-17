import {
  resolveToolRegistryConfigFromEnv,
  type ToolRegistryConfig,
} from '../../tools/registry.js';
import { buildToolsByName, type RegisteredToolName } from '../../tools/tool-selection.js';

const WEB_RESEARCH_TOOL_NAMES = [
  'date_resolver',
  'web_research',
  'tavily_extract',
  'tavily_crawl',
  'tavily_map',
  'create_brief',
  'merge_briefs',
] as const satisfies readonly RegisteredToolName[];

export function buildWebResearchTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
) {
  return buildToolsByName(WEB_RESEARCH_TOOL_NAMES, config);
}

export type { ToolRegistryConfig } from '../../tools/registry.js';

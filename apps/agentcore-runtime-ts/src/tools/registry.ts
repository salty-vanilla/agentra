import type { Tool } from '@strands-agents/sdk';
import { calculatorTool } from './calculator.tool.js';
import { createSlidePresentationTool } from './create-slide-presentation.js';
import { dateResolverTool } from './date-resolver.js';
import { buildCitationsTool, normalizeEvidenceSourceTool } from './evidence.tool.js';
import { tableSummaryTool } from './table-summary.tool.js';
import {
  tavilyCrawlTool,
  tavilyExtractTool,
  tavilyMapTool,
  tavilySearchTool,
} from './tavily.js';
import { weatherTool } from './weather.js';

export type ToolCategory =
  | 'time'
  | 'web'
  | 'calculation'
  | 'evidence'
  | 'presentation'
  | 'demo'
  | 'unknown';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

type StrandsTool = Tool;

export type RegisteredTool = {
  name: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  enabled: boolean;
  tool: StrandsTool;
  description?: string;
};

export type ToolRegistryConfig = {
  enableWeather?: boolean;
  enableTavily?: boolean;
  enablePresentation?: boolean;
  enableCalculator?: boolean;
  enableTableSummary?: boolean;
  enableEvidence?: boolean;
};

const TOOL_ORDER = [
  'date_resolver',
  'calculator',
  'table_summary',
  'normalize_evidence_source',
  'build_citations',
  'tavily_search',
  'tavily_extract',
  'tavily_crawl',
  'tavily_map',
  'create_slide_presentation',
  'getWeather',
] as const;

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
    enableWeather: resolveEnvFlag('ENABLE_WEATHER_TOOL', false),
    enableTavily: resolveEnvFlag('ENABLE_TAVILY_TOOLS', true),
    enablePresentation: resolveEnvFlag('ENABLE_PRESENTATION_TOOL', true),
    enableCalculator: resolveEnvFlag('ENABLE_CALCULATOR_TOOL', true),
    enableTableSummary: resolveEnvFlag('ENABLE_TABLE_SUMMARY_TOOL', true),
    enableEvidence: resolveEnvFlag('ENABLE_EVIDENCE_TOOLS', true),
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
  const enableWeather = resolveToolEnabled(config, 'enableWeather', false);
  const enableTavily = resolveToolEnabled(config, 'enableTavily', true);
  const enablePresentation = resolveToolEnabled(config, 'enablePresentation', true);
  const enableCalculator = resolveToolEnabled(config, 'enableCalculator', true);
  const enableTableSummary = resolveToolEnabled(config, 'enableTableSummary', true);
  const enableEvidence = resolveToolEnabled(config, 'enableEvidence', true);

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
    {
      name: 'getWeather',
      category: 'demo',
      riskLevel: 'low',
      enabled: enableWeather,
      tool: weatherTool,
    },
  ];

  return tools;
}

export function buildGeneralTools(
  config: ToolRegistryConfig = resolveToolRegistryConfigFromEnv(),
): StrandsTool[] {
  const registeredTools = getRegisteredTools(config);
  const enabledTools = new Map(
    registeredTools.map((entry) => [entry.name, entry] as const),
  );

  return TOOL_ORDER.flatMap((toolName) => {
    const entry = enabledTools.get(toolName);
    if (!entry?.enabled) {
      return [];
    }

    return [entry.tool];
  });
}

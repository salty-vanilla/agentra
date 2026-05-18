import { Agent, BedrockModel, type Plugin } from '@strands-agents/sdk';
import { WEB_RESEARCH_SYSTEM_PROMPT } from './prompt.js';
import { buildWebResearchTools } from './tools.js';
import type { WebResearchAgentConfig, WebResearchModelConfig } from './types.js';

const DEFAULT_MODEL_CONFIG: Required<WebResearchModelConfig> = {
  modelId:
    process.env.BEDROCK_MODEL_ID_WEB_RESEARCH ??
    process.env.BEDROCK_MODEL_ID_SONNET ??
    'global.anthropic.claude-sonnet-4-6',
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  maxTokens: 8192,
  temperature: 0.3,
};

export function resolveWebResearchModelId(
  config?: Pick<WebResearchModelConfig, 'modelId'>,
): string {
  return config?.modelId ?? DEFAULT_MODEL_CONFIG.modelId;
}

function createDefaultModel(config?: WebResearchModelConfig): BedrockModel {
  return new BedrockModel({
    modelId: resolveWebResearchModelId(config),
    region: config?.region ?? DEFAULT_MODEL_CONFIG.region,
    maxTokens: config?.maxTokens ?? DEFAULT_MODEL_CONFIG.maxTokens,
    temperature: config?.temperature ?? DEFAULT_MODEL_CONFIG.temperature,
  });
}

export function createWebResearchAgent(config: WebResearchAgentConfig = {}): Agent {
  const plugins: Plugin[] = [...(config.plugins ?? [])];
  if (config.sessionManager) {
    plugins.push(config.sessionManager);
  }

  return new Agent({
    name: 'Web Research Agent',
    id: 'web-research-agent',
    description: 'Owns public web research workflows, citations, and briefs.',
    model: config.model ?? createDefaultModel(config.modelConfig),
    systemPrompt: WEB_RESEARCH_SYSTEM_PROMPT,
    plugins,
    tools: buildWebResearchTools(config.toolConfig),
    ...(config.printer !== undefined ? { printer: config.printer } : {}),
  });
}

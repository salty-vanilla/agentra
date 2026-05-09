import { Agent, BedrockModel, type Plugin } from '@strands-agents/sdk';
import { MANUFACTURING_LINE_SYSTEM_PROMPT } from './prompt.js';
import { buildManufacturingLineTools } from './tools.js';
import type {
  ManufacturingLineAgentConfig,
  ManufacturingLineModelConfig,
} from './types.js';

const DEFAULT_MODEL_CONFIG: Required<ManufacturingLineModelConfig> = {
  modelId:
    process.env.BEDROCK_MODEL_ID_MANUFACTURING_LINE ??
    process.env.BEDROCK_MODEL_ID_SONNET ??
    'global.anthropic.claude-sonnet-4-6',
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  maxTokens: 4096,
  temperature: 0.3,
};

function createDefaultModel(config?: ManufacturingLineModelConfig): BedrockModel {
  return new BedrockModel({
    modelId: config?.modelId ?? DEFAULT_MODEL_CONFIG.modelId,
    region: config?.region ?? DEFAULT_MODEL_CONFIG.region,
    maxTokens: config?.maxTokens ?? DEFAULT_MODEL_CONFIG.maxTokens,
    temperature: config?.temperature ?? DEFAULT_MODEL_CONFIG.temperature,
  });
}

export function createManufacturingLineAgent(
  config: ManufacturingLineAgentConfig = {},
): Agent {
  const plugins: Plugin[] = [...(config.plugins ?? [])];
  if (config.sessionManager) {
    plugins.push(config.sessionManager);
  }

  return new Agent({
    name: 'Manufacturing Line Agent',
    id: 'manufacturing-line-agent',
    description: 'Owns manufacturing-line normal and structured RAG workflows.',
    model: config.model ?? createDefaultModel(config.modelConfig),
    systemPrompt: MANUFACTURING_LINE_SYSTEM_PROMPT,
    plugins,
    tools: buildManufacturingLineTools(config.toolConfig),
  });
}

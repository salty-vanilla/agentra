import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, BedrockModel, type Plugin } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { buildRouterTools } from '../../tools/registry.js';
import { buildRouterPrompt } from './prompt.js';
import type { RouterAgentConfig, RouterModelConfig } from './types.js';

const DEFAULT_MODEL_CONFIG: Required<RouterModelConfig> = {
  modelId: process.env.BEDROCK_MODEL_ID_SONNET ?? 'global.anthropic.claude-sonnet-4-6',
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  maxTokens: 4096,
  temperature: 0.5,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../../../skills');

const agentSkillsPlugin = new AgentSkills({
  skills: [
    join(SKILLS_DIR, 'presentation-author-handoff'),
    join(SKILLS_DIR, 'rag-research'),
    join(SKILLS_DIR, 'web-research'),
  ],
});

function createDefaultModel(config?: RouterModelConfig): BedrockModel {
  return new BedrockModel({
    modelId: config?.modelId ?? DEFAULT_MODEL_CONFIG.modelId,
    region: config?.region ?? DEFAULT_MODEL_CONFIG.region,
    maxTokens: config?.maxTokens ?? DEFAULT_MODEL_CONFIG.maxTokens,
    temperature: config?.temperature ?? DEFAULT_MODEL_CONFIG.temperature,
  });
}

export function createRouterAgent(config: RouterAgentConfig = {}): Agent {
  const plugins: Plugin[] = [agentSkillsPlugin, ...(config.plugins ?? [])];
  if (config.sessionManager) {
    plugins.push(config.sessionManager);
  }

  return new Agent({
    model: config.model ?? createDefaultModel(config.modelConfig),
    plugins,
    tools: buildRouterTools(config.toolConfig),
  });
}

export { buildRouterPrompt };

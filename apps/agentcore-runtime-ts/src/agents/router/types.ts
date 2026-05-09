import type {
  AgentConfig,
  BedrockModelOptions,
  Plugin,
  SessionManager,
} from '@strands-agents/sdk';
import type { ToolRegistryConfig } from '../../tools/registry.js';

export type RouterToneKey = 'business' | 'engineer';

export type RouterModelConfig = Pick<
  BedrockModelOptions,
  'modelId' | 'region' | 'maxTokens' | 'temperature'
>;

export type RouterAgentConfig = {
  model?: AgentConfig['model'];
  modelConfig?: RouterModelConfig;
  sessionManager?: SessionManager | undefined;
  plugins?: Plugin[] | undefined;
  toolConfig?: ToolRegistryConfig | undefined;
};

export type RouterPromptInput = {
  userPrompt: string;
  tone: RouterToneKey;
  commandDirective?: string | undefined;
};

import type {
  AgentConfig,
  BedrockModelOptions,
  Plugin,
  SessionManager,
} from '@strands-agents/sdk';
import type { ToolRegistryConfig } from '../../tools/registry.js';

export type WebResearchModelConfig = Pick<
  BedrockModelOptions,
  'modelId' | 'region' | 'maxTokens' | 'temperature'
>;

export type WebResearchAgentConfig = {
  model?: AgentConfig['model'];
  modelConfig?: WebResearchModelConfig;
  sessionManager?: SessionManager | undefined;
  plugins?: Plugin[] | undefined;
  toolConfig?: ToolRegistryConfig | undefined;
};

export type WebResearchAgentResult = {
  answer: string;
  sources?: unknown[];
  citations?: unknown[];
  brief?: unknown;
  caveats?: string[];
  nextActions?: string[];
  metadata?: Record<string, unknown>;
};

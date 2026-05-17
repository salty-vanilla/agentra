import type {
  AgentConfig,
  BedrockModelOptions,
  Plugin,
  SessionManager,
} from '@strands-agents/sdk';
import type { z } from 'zod';
import type { ToolRegistryConfig } from '../../tools/registry.js';
import type { SubAgentHandoffOutput, SubAgentKind } from '../handoff-types.js';
import type { webResearchAgentHandoffInputSchema } from './handoff.js';

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
  printer?: AgentConfig['printer'];
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

export type WebResearchAgentKind = Extract<SubAgentKind, 'web_research'>;

export type WebResearchAgentHandoffInput = z.infer<
  typeof webResearchAgentHandoffInputSchema
>;

export type WebResearchAgentHandoffOutput = SubAgentHandoffOutput & {
  agentKind: WebResearchAgentKind;
};

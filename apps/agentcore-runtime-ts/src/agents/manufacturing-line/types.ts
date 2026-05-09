import type {
  AgentConfig,
  BedrockModelOptions,
  Plugin,
  SessionManager,
} from '@strands-agents/sdk';
import type { z } from 'zod';
import type { ToolRegistryConfig } from '../../tools/registry.js';
import type {
  manufacturingLineAgentHandoffInputSchema,
  manufacturingLineAgentHandoffOutputSchema,
} from './handoff.js';

export type ManufacturingLineModelConfig = Pick<
  BedrockModelOptions,
  'modelId' | 'region' | 'maxTokens' | 'temperature'
>;

export type ManufacturingLineAgentConfig = {
  model?: AgentConfig['model'];
  modelConfig?: ManufacturingLineModelConfig;
  sessionManager?: SessionManager | undefined;
  plugins?: Plugin[] | undefined;
  toolConfig?: ToolRegistryConfig | undefined;
};

export type ManufacturingLineAgentResult = {
  answer: string;
  sources?: unknown[];
  citations?: unknown[];
  brief?: unknown;
  caveats?: string[];
  nextActions?: string[];
  metadata?: Record<string, unknown>;
};

export type ManufacturingLineAgentHandoffInput = z.infer<
  typeof manufacturingLineAgentHandoffInputSchema
>;

export type ManufacturingLineAgentHandoffOutput = z.infer<
  typeof manufacturingLineAgentHandoffOutputSchema
>;

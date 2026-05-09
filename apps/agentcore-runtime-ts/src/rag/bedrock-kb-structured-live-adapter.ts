import {
  buildBedrockKbStructuredRequest,
  createNotImplementedBedrockKbStructuredRawResult,
} from './bedrock-kb-structured-normalizer.js';
import type {
  BedrockKbStructuredRawResult,
  BedrockKbStructuredRequest,
} from './bedrock-kb-structured-types.js';

export type BedrockKbStructuredLiveAdapterClient = {
  send(command: unknown): Promise<unknown>;
};

export type BedrockKbStructuredLiveAdapterConfig = {
  client?: BedrockKbStructuredLiveAdapterClient | undefined;
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
};

export interface BedrockKbStructuredLiveAdapter {
  execute(request: BedrockKbStructuredRequest): Promise<BedrockKbStructuredRawResult>;
}

function buildBoundaryMessage(config: BedrockKbStructuredLiveAdapterConfig): string {
  const knownParts = [
    config.knowledgeBaseId ? undefined : 'missing knowledge base id',
    config.region ? undefined : 'missing region',
    config.dataSourceName ? undefined : 'missing data source name',
  ].filter(Boolean);

  if (knownParts.length === 0) {
    return 'Bedrock KB structured live adapter boundary is not implemented yet.';
  }

  return `Bedrock KB structured live adapter boundary is not implemented yet (${knownParts.join(', ')}).`;
}

export class NotImplementedBedrockKbStructuredLiveAdapter
  implements BedrockKbStructuredLiveAdapter
{
  constructor(private readonly config: BedrockKbStructuredLiveAdapterConfig = {}) {}

  async execute(
    request: BedrockKbStructuredRequest,
  ): Promise<BedrockKbStructuredRawResult> {
    return createNotImplementedBedrockKbStructuredRawResult(request, {
      message: buildBoundaryMessage(this.config),
    });
  }
}

export function createBedrockKbStructuredLiveAdapter(
  config: BedrockKbStructuredLiveAdapterConfig = {},
): BedrockKbStructuredLiveAdapter {
  return new NotImplementedBedrockKbStructuredLiveAdapter(config);
}

export function createBedrockKbStructuredLiveAdapterRequest(input: {
  plan: BedrockKbStructuredRequest['plan'];
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
  executionMode?: BedrockKbStructuredRequest['executionMode'] | undefined;
  dryRun?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}): BedrockKbStructuredRequest {
  return buildBedrockKbStructuredRequest(input);
}

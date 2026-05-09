import {
  type BedrockKbStructuredRuntimeConfig,
  describeBedrockKbStructuredLiveBlocker,
  isBedrockKbStructuredLiveReady,
  resolveBedrockKbStructuredRuntimeConfig,
} from './bedrock-kb-structured-config.js';
import {
  type BedrockKbStructuredLiveAdapter,
  createBedrockKbStructuredLiveAdapter,
} from './bedrock-kb-structured-live-adapter.js';
import {
  buildBedrockKbStructuredRequest,
  createNotImplementedBedrockKbStructuredRawResult,
  normalizeBedrockKbStructuredResult,
} from './bedrock-kb-structured-normalizer.js';
import type {
  StructuredQueryExecutionInput,
  StructuredQueryExecutionOutput,
  StructuredQueryProvider,
} from './structured-query-executor-types.js';

export type BedrockKbStructuredProviderConfig = {
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
  defaultDryRun?: boolean | undefined;
  runtimeConfig?: BedrockKbStructuredRuntimeConfig | undefined;
  liveAdapter?: BedrockKbStructuredLiveAdapter | undefined;
};

function resolveProviderRuntimeConfig(
  config: BedrockKbStructuredProviderConfig,
): BedrockKbStructuredRuntimeConfig {
  const runtimeConfig = config.runtimeConfig ?? resolveBedrockKbStructuredRuntimeConfig();

  return {
    ...runtimeConfig,
    knowledgeBaseId: config.knowledgeBaseId ?? runtimeConfig.knowledgeBaseId,
    region: config.region ?? runtimeConfig.region,
    dataSourceName: config.dataSourceName ?? runtimeConfig.dataSourceName,
  };
}

export class BedrockKbStructuredProvider implements StructuredQueryProvider {
  readonly kind = 'bedrock_kb_structured' as const;

  constructor(private readonly config: BedrockKbStructuredProviderConfig = {}) {}

  async execute(
    input: StructuredQueryExecutionInput,
  ): Promise<StructuredQueryExecutionOutput> {
    const runtimeConfig = resolveProviderRuntimeConfig(this.config);
    const request = buildBedrockKbStructuredRequest({
      plan: input.plan,
      knowledgeBaseId: runtimeConfig.knowledgeBaseId,
      region: runtimeConfig.region,
      dataSourceName: runtimeConfig.dataSourceName,
      executionMode: runtimeConfig.mode,
      dryRun: input.dryRun ?? this.config.defaultDryRun ?? runtimeConfig.mode !== 'live',
      metadata: input.metadata,
    });

    const blocker = describeBedrockKbStructuredLiveBlocker(runtimeConfig);
    const shouldUseLiveAdapter = isBedrockKbStructuredLiveReady(runtimeConfig);
    const liveAdapter =
      this.config.liveAdapter ??
      createBedrockKbStructuredLiveAdapter({
        knowledgeBaseId: runtimeConfig.knowledgeBaseId,
        region: runtimeConfig.region,
        dataSourceName: runtimeConfig.dataSourceName,
      });

    const rawResult = shouldUseLiveAdapter
      ? await liveAdapter.execute(request)
      : runtimeConfig.mode === 'live'
        ? createNotImplementedBedrockKbStructuredRawResult(request, {
            message:
              blocker ??
              'Bedrock KB structured live adapter boundary is not configured for live execution.',
          })
        : createNotImplementedBedrockKbStructuredRawResult(request);

    return normalizeBedrockKbStructuredResult({
      request,
      rawResult,
      createBrief: input.createBrief,
    });
  }
}

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
};

export class BedrockKbStructuredProvider implements StructuredQueryProvider {
  readonly kind = 'bedrock_kb_structured' as const;

  constructor(private readonly config: BedrockKbStructuredProviderConfig = {}) {}

  async execute(
    input: StructuredQueryExecutionInput,
  ): Promise<StructuredQueryExecutionOutput> {
    const request = buildBedrockKbStructuredRequest({
      plan: input.plan,
      knowledgeBaseId: this.config.knowledgeBaseId,
      region: this.config.region,
      dataSourceName: this.config.dataSourceName,
      dryRun: input.dryRun ?? this.config.defaultDryRun ?? true,
      metadata: input.metadata,
    });

    const rawResult = createNotImplementedBedrockKbStructuredRawResult(request);

    return normalizeBedrockKbStructuredResult({
      request,
      rawResult,
      createBrief: input.createBrief,
    });
  }
}

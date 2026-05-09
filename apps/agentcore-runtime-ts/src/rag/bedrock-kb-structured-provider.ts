import {
  buildCitations,
  createBrief,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
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

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export class BedrockKbStructuredProvider implements StructuredQueryProvider {
  readonly kind = 'bedrock_kb_structured' as const;

  constructor(private readonly config: BedrockKbStructuredProviderConfig = {}) {}

  async execute(
    input: StructuredQueryExecutionInput,
  ): Promise<StructuredQueryExecutionOutput> {
    const dryRun = input.dryRun ?? this.config.defaultDryRun ?? true;
    const sources = [
      normalizeEvidenceSource({
        type: 'structured_data',
        title: `Bedrock KB structured query stub: ${input.plan.intent}`,
        snippet:
          'Bedrock KB structured provider is not implemented yet. No real data was queried.',
        metadata: {
          provider: 'bedrock-kb-structured-provider',
          planId: input.plan.id,
          intent: input.plan.intent,
          dataSourceKind: 'bedrock_kb_structured',
          status: 'not_implemented',
        },
      }),
    ];
    const citations = buildCitations(sources);
    const shouldCreateBrief = input.createBrief ?? true;
    const brief = shouldCreateBrief
      ? createBrief({
          language: 'unknown',
          outputFormat: 'report',
          topic: input.plan.question,
          goal: 'Summarize structured query execution results.',
          openQuestions: ['Bedrock KB structured provider is not implemented yet.'],
          sourceIds: sources.map((source) => source.id),
          metadata: {
            provider: 'bedrock-kb-structured-provider',
            planId: input.plan.id,
            intent: input.plan.intent,
            status: 'not_implemented',
          },
        })
      : undefined;

    return {
      plan: input.plan,
      status: 'not_implemented',
      rows: [],
      sources,
      citations,
      ...definedProperty('brief', brief),
      summary: {
        status: 'not_implemented',
        rowCount: 0,
        columnNames: [],
        dataSourceKind: 'bedrock_kb_structured',
        intent: input.plan.intent,
        dryRun,
        message: 'Bedrock KB structured provider is not implemented yet.',
      },
      metadata: {
        provider: 'bedrock-kb-structured-provider',
        planId: input.plan.id,
        ...definedProperty('knowledgeBaseId', this.config.knowledgeBaseId),
        ...definedProperty('region', this.config.region),
        ...definedProperty('dataSourceName', this.config.dataSourceName),
      },
    };
  }
}

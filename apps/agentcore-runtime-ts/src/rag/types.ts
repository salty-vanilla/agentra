import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';

export type RagProviderKind =
  | 'bedrock_kb_retrieve'
  | 'bedrock_kb_structured'
  | 'web_research'
  | 'agentic'
  | 'unknown';

export type RagMetadataFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equals'
  | 'less_than'
  | 'less_than_or_equals'
  | 'in'
  | 'not_in'
  | 'starts_with'
  | 'list_contains'
  | 'string_contains';

export type RagMetadataFilterCondition = {
  key: string;
  operator: RagMetadataFilterOperator;
  value: string | number | boolean | Array<string | number | boolean>;
};

export type RagMetadataFilter = {
  andAll?: RagMetadataFilterCondition[];
  orAll?: RagMetadataFilterCondition[];
};

export type RagSearchInput = {
  query: string;
  topK?: number;
  createBrief?: boolean;
  briefTopic?: string | undefined;
  briefGoal?: string | undefined;
  language?: 'ja' | 'en' | 'unknown';
  metadataFilter?: RagMetadataFilter | undefined;
  scoreThreshold?: number | undefined;
  queryRewriteHint?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type RagSearchOutput = {
  query: string;
  provider: RagProviderKind;
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief;
  rawResultSummary: {
    resultCount: number;
    originalResultCount?: number | undefined;
    filteredByScoreCount?: number | undefined;
    noResults?: boolean | undefined;
  };
  metadata?: Record<string, unknown> | undefined;
};

export interface RagProvider {
  readonly kind: RagProviderKind;
  search(input: RagSearchInput): Promise<RagSearchOutput>;
}

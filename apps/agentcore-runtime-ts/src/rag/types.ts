import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';

export type RagProviderKind =
  | 'bedrock_kb_retrieve'
  | 'bedrock_kb_structured'
  | 'web_research'
  | 'agentic'
  | 'unknown';

export type RagSearchInput = {
  query: string;
  topK?: number;
  createBrief?: boolean;
  briefTopic?: string | undefined;
  briefGoal?: string | undefined;
  language?: 'ja' | 'en' | 'unknown';
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
  };
  metadata?: Record<string, unknown> | undefined;
};

export interface RagProvider {
  readonly kind: RagProviderKind;
  search(input: RagSearchInput): Promise<RagSearchOutput>;
}

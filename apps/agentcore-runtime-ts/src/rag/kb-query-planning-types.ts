export type KbRetrievalIntent =
  | 'document_lookup'
  | 'how_to'
  | 'troubleshooting'
  | 'policy_lookup'
  | 'spec_lookup'
  | 'comparison'
  | 'summary'
  | 'unknown';

export type KbQueryPlan = {
  id: string;
  createdAt: string;
  query: string;
  intent: KbRetrievalIntent;
  topK: number;
  scoreThreshold?: number | undefined;
  queryRewriteHint?: string | undefined;
  expectedSourceTypes?: string[] | undefined;
  metadataFilterHints?: string[] | undefined;
  missingContext?: string[] | undefined;
  confidence: number;
  metadata?: Record<string, unknown> | undefined;
};

export type KbQueryPlanInput = {
  query: string;
  intent?: KbRetrievalIntent | undefined;
  topK?: number | undefined;
  scoreThreshold?: number | undefined;
  queryRewriteHint?: string | undefined;
  expectedSourceTypes?: string[] | undefined;
  metadataFilterHints?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';

export type KbRagEvidenceSource = {
  id: string;
  type: EvidenceSource['type'];
  title?: string | undefined;
  url?: string | undefined;
  uri?: string | undefined;
  snippet?: string | undefined;
  retrievedAt: string;
  score?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbRagCitation = {
  id: string;
  label: string;
  sourceId: string;
  type: Citation['type'];
  title?: string | undefined;
  url?: string | undefined;
  uri?: string | undefined;
};

export type KbRagBrief = {
  id: string;
  createdAt: string;
  language?: Brief['language'] | undefined;
  audience?: Brief['audience'] | undefined;
  outputFormat?: Brief['outputFormat'] | undefined;
  topic?: string | undefined;
  goal?: string | undefined;
  constraints?: string[] | undefined;
  keyFacts?: string[] | undefined;
  openQuestions?: string[] | undefined;
  sourceIds?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbRagFlowStatus =
  | 'answer_ready'
  | 'needs_clarification'
  | 'not_configured'
  | 'fallback_recommended'
  | 'error';

export type KbRagFlowOutput = {
  status: KbRagFlowStatus;
  retrieval?: {
    query?: string | undefined;
    provider?: string | undefined;
    sources: KbRagEvidenceSource[];
    citations: KbRagCitation[];
    brief?: KbRagBrief | undefined;
    rawResultSummary?: {
      resultCount: number;
      originalResultCount?: number | undefined;
      filteredByScoreCount?: number | undefined;
      noResults?: boolean | undefined;
    } | undefined;
    metadata?: Record<string, unknown> | undefined;
  } | undefined;
  nextAction?: string | undefined;
  messages?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbAnswerSynthesisStatus =
  | 'answer_ready'
  | 'needs_clarification'
  | 'not_configured'
  | 'fallback_recommended'
  | 'no_results'
  | 'weak_evidence'
  | 'error';

export type KbAnswerSynthesisInput = {
  flow: KbRagFlowOutput;
  includeSourcePreview?: boolean | undefined;
  maxSources?: number | undefined;
  createBrief?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbAnswerSynthesisOutput = {
  status: KbAnswerSynthesisStatus;
  title: string;
  summary: string;
  keyFindings: string[];
  caveats: string[];
  nextActions: string[];
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief | undefined;
  sourcePreview?: Array<{
    title?: string;
    snippet?: string;
    score?: number;
  }> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';
import type { StructuredRagFlowOutput } from './structured-rag-flow-types.js';

export type StructuredAnswerTone =
  | 'concise'
  | 'detailed'
  | 'executive'
  | 'engineering';

export type StructuredAnswerSynthesisInput = {
  flow: StructuredRagFlowOutput;
  tone?: StructuredAnswerTone | undefined;
  includeRows?: boolean | undefined;
  maxRows?: number | undefined;
  createBrief?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredAnswerSynthesisStatus =
  | 'answer_ready'
  | 'needs_clarification'
  | 'not_configured'
  | 'unsupported'
  | 'no_data'
  | 'not_implemented'
  | 'error';

export type StructuredAnswerSynthesisOutput = {
  status: StructuredAnswerSynthesisStatus;
  title: string;
  summary: string;
  keyFindings: string[];
  caveats: string[];
  nextActions: string[];
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief | undefined;
  rowsPreview?: Array<Record<string, string | number | boolean | null>> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

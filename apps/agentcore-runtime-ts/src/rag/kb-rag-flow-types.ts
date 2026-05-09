import type { KbQueryPlan, KbQueryPlanInput } from './kb-query-planning-types.js';
import type { KbRetrievalReadinessResult } from './kb-retrieval-readiness-types.js';
import type { RagSearchOutput } from './types.js';

export type KbRagFlowMode = 'plan_only' | 'readiness_only' | 'retrieve_if_ready';

export type KbRagFlowInput = {
  query?: string | undefined;
  plan?: KbQueryPlan | undefined;
  planInput?: KbQueryPlanInput | undefined;
  mode?: KbRagFlowMode | undefined;
  kbRetrieveEnabled?: boolean | undefined;
  knowledgeBaseConfigured?: boolean | undefined;
  allowWebFallback?: boolean | undefined;
  createBrief?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbRagFlowStatus =
  | 'planned'
  | 'ready'
  | 'retrieved'
  | 'needs_clarification'
  | 'not_configured'
  | 'fallback_recommended'
  | 'unsupported'
  | 'answer_ready'
  | 'error';

export type KbRagFlowOutput = {
  status: KbRagFlowStatus;
  plan: KbQueryPlan;
  readiness?: KbRetrievalReadinessResult | undefined;
  retrieval?: RagSearchOutput | undefined;
  nextAction: string;
  messages: string[];
  metadata?: Record<string, unknown> | undefined;
};

import type { KbQueryPlan } from './kb-query-planning-types.js';

export type KbRetrievalReadinessStatus =
  | 'ready'
  | 'needs_clarification'
  | 'not_configured'
  | 'fallback_recommended'
  | 'unsupported';

export type KbRetrievalNextAction =
  | 'retrieve_kb'
  | 'ask_follow_up'
  | 'run_diagnostics'
  | 'fallback_to_web_research'
  | 'not_supported';

export type KbRetrievalReadinessInput = {
  plan: KbQueryPlan;
  kbRetrieveEnabled?: boolean | undefined;
  knowledgeBaseConfigured?: boolean | undefined;
  allowWebFallback?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbRetrievalReadinessResult = {
  status: KbRetrievalReadinessStatus;
  executable: boolean;
  nextAction: KbRetrievalNextAction;
  missingContext: string[];
  warnings: string[];
  rationale: string[];
  plan: KbQueryPlan;
  metadata?: Record<string, unknown> | undefined;
};

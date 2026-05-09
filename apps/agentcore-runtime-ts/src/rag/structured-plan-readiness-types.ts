import type { StructuredQueryPlan } from './structured-query-types.js';

export type StructuredPlanReadinessStatus =
  | 'ready'
  | 'needs_clarification'
  | 'unsupported'
  | 'not_configured';

export type StructuredProviderPath =
  | 'bedrock_kb_structured'
  | 'mock'
  | 'athena_query_generator_future'
  | 'unknown';

export type StructuredPlanNextAction =
  | 'execute_bedrock_structured'
  | 'execute_mock'
  | 'ask_follow_up'
  | 'inspect_catalog'
  | 'fallback_to_kb_retrieve'
  | 'fallback_to_web_research'
  | 'not_supported';

export type StructuredQueryPlanValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

export type StructuredQueryPlanValidationResult = {
  valid: boolean;
  issues: StructuredQueryPlanValidationIssue[];
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredPlanReadinessInput = {
  plan: StructuredQueryPlan;
  validation?: StructuredQueryPlanValidationResult | undefined;
  preferredProvider?: StructuredProviderPath | undefined;
  allowMock?: boolean | undefined;
  bedrockStructuredEnabled?: boolean | undefined;
  queryGeneratorEnabled?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredPlanReadinessResult = {
  status: StructuredPlanReadinessStatus;
  recommendedProvider: StructuredProviderPath;
  nextAction: StructuredPlanNextAction;
  executable: boolean;
  missingSlots: string[];
  blockingIssues: StructuredQueryPlanValidationIssue[];
  warnings: StructuredQueryPlanValidationIssue[];
  rationale: string[];
  plan: StructuredQueryPlan;
  metadata?: Record<string, unknown> | undefined;
};

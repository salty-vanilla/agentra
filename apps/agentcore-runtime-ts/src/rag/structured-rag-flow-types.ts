import type { StructuredQueryExecutionOutput } from './structured-query-executor-types.js';
import type {
  StructuredPlanReadinessResult,
  StructuredProviderPath,
  StructuredQueryPlanValidationResult,
} from './structured-plan-readiness-types.js';
import type { StructuredQueryPlan, StructuredQueryPlanInput } from './structured-query-types.js';

export type StructuredRagFlowMode =
  | 'plan_only'
  | 'validate_only'
  | 'readiness_only'
  | 'execute_if_ready';

export type StructuredRagFlowInput = {
  question?: string | undefined;
  plan?: StructuredQueryPlan | undefined;
  planInput?: StructuredQueryPlanInput | undefined;
  mode?: StructuredRagFlowMode | undefined;
  preferredProvider?: StructuredProviderPath | undefined;
  validateAgainstCatalog?: boolean | undefined;
  allowMock?: boolean | undefined;
  bedrockStructuredEnabled?: boolean | undefined;
  queryGeneratorEnabled?: boolean | undefined;
  createBrief?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredRagFlowStatus =
  | 'planned'
  | 'validated'
  | 'ready'
  | 'executed'
  | 'needs_clarification'
  | 'not_configured'
  | 'unsupported'
  | 'error';

export type StructuredRagFlowOutput = {
  status: StructuredRagFlowStatus;
  plan: StructuredQueryPlan;
  validation?: StructuredQueryPlanValidationResult | undefined;
  readiness?: StructuredPlanReadinessResult | undefined;
  execution?: StructuredQueryExecutionOutput | undefined;
  nextAction: string;
  messages: string[];
  metadata?: Record<string, unknown> | undefined;
};

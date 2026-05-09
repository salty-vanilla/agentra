import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { evaluateStructuredPlanReadiness } from '../rag/index.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_METADATA_KEYS = 100;
const MAX_ISSUE_COUNT = 100;

const structuredQueryIntentSchema = z.enum([
  'error_code_lookup',
  'anomaly_summary',
  'kpi_aggregation',
  'equipment_history_lookup',
  'production_trend',
  'generic_lookup',
  'unknown',
]);

const structuredQueryDataSourceKindSchema = z.enum([
  'bedrock_kb_structured',
  'athena',
  'redshift',
  'rds',
  'dynamodb',
  'mock',
  'unknown',
]);

const structuredQueryMetricSchema = z.enum([
  'count',
  'sum',
  'average',
  'min',
  'max',
  'rate',
  'trend',
  'top_n',
  'unknown',
]);

const structuredQueryFilterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'in',
  'greater_than',
  'greater_than_or_equals',
  'less_than',
  'less_than_or_equals',
]);

const structuredQueryPlanValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const structuredQueryPlanValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(structuredQueryPlanValidationIssueSchema).max(MAX_ISSUE_COUNT),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredQueryPlanSchema = z.object({
  id: z.string(),
  createdAt: z.string().trim().min(1),
  intent: structuredQueryIntentSchema,
  dataSourceKind: structuredQueryDataSourceKindSchema,
  question: z.string(),
  targetEntity: z.string().trim().optional(),
  timeRange: z
    .object({
      start: z.string().trim().optional(),
      end: z.string().trim().optional(),
      timezone: z.string().trim().optional(),
    })
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.string().trim().min(1),
        operator: structuredQueryFilterOperatorSchema,
        value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.union([z.string(), z.number(), z.boolean()])),
        ]),
      }),
    )
    .optional(),
  metrics: z.array(structuredQueryMetricSchema).optional(),
  groupBy: z.array(z.string().trim().min(1)).optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string().trim().min(1),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  limit: z.number().int().positive().max(1000).optional(),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()).optional(),
  missingSlots: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredPlanReadinessInputSchema = z.object({
  plan: structuredQueryPlanSchema,
  validation: structuredQueryPlanValidationResultSchema.optional(),
  preferredProvider: z
    .enum(['bedrock_kb_structured', 'mock', 'athena_query_generator_future', 'unknown'])
    .optional(),
  allowMock: z.boolean().optional(),
  bedrockStructuredEnabled: z.boolean().optional(),
  queryGeneratorEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StructuredPlanReadinessToolInput = z.infer<
  typeof structuredPlanReadinessInputSchema
>;

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateStructuredPlanReadinessInput(
  input: StructuredPlanReadinessToolInput,
): void {
  if (!input.plan.id.trim()) {
    throw new Error('plan.id must not be empty');
  }

  if (!input.plan.question.trim()) {
    throw new Error('plan.question must not be empty');
  }

  validateMetadata(input.plan.metadata);
  validateMetadata(input.metadata);
}

export function executeStructuredPlanReadinessTool(
  input: StructuredPlanReadinessToolInput,
) {
  try {
    const validatedInput = structuredPlanReadinessInputSchema.parse(input);
    validateStructuredPlanReadinessInput(validatedInput);
    return toolSuccess(evaluateStructuredPlanReadiness(validatedInput));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredPlanReadinessTool = tool({
  name: 'structured_plan_readiness',
  description:
    'Evaluate whether a StructuredQueryPlan is ready for structured RAG execution and recommend the next provider/action. This does not query databases, generate SQL, or call Bedrock.',
  inputSchema: structuredPlanReadinessInputSchema,
  callback: executeStructuredPlanReadinessTool,
});

export { structuredPlanReadinessTool };

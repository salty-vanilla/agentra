import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { runStructuredRagFlow } from '../rag/structured-rag-flow.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_QUESTION_LENGTH = 2000;
const MAX_METADATA_KEYS = 100;
const MAX_FILTER_COUNT = 50;
const MAX_GROUP_BY_COUNT = 20;
const MAX_ORDER_BY_COUNT = 10;
const MAX_ARRAY_COUNT = 50;
const QUESTION_TOO_LONG_MESSAGE = `question must not exceed ${MAX_QUESTION_LENGTH} characters`;

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

const questionSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.length <= MAX_QUESTION_LENGTH, {
    message: QUESTION_TOO_LONG_MESSAGE,
  });

const structuredQueryPlanInputSchema = z.object({
  question: questionSchema,
  intent: structuredQueryIntentSchema.optional(),
  dataSourceKind: structuredQueryDataSourceKindSchema.optional(),
  targetEntity: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.string(),
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
  groupBy: z.array(z.string()).optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  limit: z.number().int().positive().max(1000).optional(),
  assumptions: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredQueryPlanSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  intent: structuredQueryIntentSchema,
  dataSourceKind: structuredQueryDataSourceKindSchema,
  question: questionSchema,
  targetEntity: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.string(),
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
  groupBy: z.array(z.string()).optional(),
  orderBy: z
    .array(
      z.object({
        field: z.string(),
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

const structuredRagFlowInputSchema = z
  .object({
    question: questionSchema.optional(),
    plan: structuredQueryPlanSchema.optional(),
    planInput: structuredQueryPlanInputSchema.optional(),
    mode: z
      .enum(['plan_only', 'validate_only', 'readiness_only', 'execute_if_ready'])
      .optional(),
    preferredProvider: z
      .enum(['bedrock_kb_structured', 'mock', 'athena_query_generator_future', 'unknown'])
      .optional(),
    validateAgainstCatalog: z.boolean().optional(),
    allowMock: z.boolean().optional(),
    bedrockStructuredEnabled: z.boolean().optional(),
    queryGeneratorEnabled: z.boolean().optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.question === undefined &&
      input.plan === undefined &&
      input.planInput === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of question, plan, or planInput.',
        path: ['question'],
      });
    }

    if (Object.keys(input.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['metadata'],
      });
    }

    if (Object.keys(input.plan?.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `plan.metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['plan', 'metadata'],
      });
    }

    if (Object.keys(input.planInput?.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['planInput', 'metadata'],
      });
    }

    if ((input.planInput?.groupBy?.length ?? 0) > MAX_GROUP_BY_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.groupBy must not exceed ${MAX_GROUP_BY_COUNT} items`,
        path: ['planInput', 'groupBy'],
      });
    }

    if ((input.planInput?.orderBy?.length ?? 0) > MAX_ORDER_BY_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.orderBy must not exceed ${MAX_ORDER_BY_COUNT} items`,
        path: ['planInput', 'orderBy'],
      });
    }

    if ((input.planInput?.filters?.length ?? 0) > MAX_FILTER_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.filters must not exceed ${MAX_FILTER_COUNT} items`,
        path: ['planInput', 'filters'],
      });
    }

    if ((input.planInput?.assumptions?.length ?? 0) > MAX_ARRAY_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.assumptions must not exceed ${MAX_ARRAY_COUNT} items`,
        path: ['planInput', 'assumptions'],
      });
    }

    if ((input.planInput?.notes?.length ?? 0) > MAX_ARRAY_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `planInput.notes must not exceed ${MAX_ARRAY_COUNT} items`,
        path: ['planInput', 'notes'],
      });
    }
  });

export type StructuredRagFlowToolInput = z.infer<typeof structuredRagFlowInputSchema>;

function validateStructuredRagFlowInput(input: StructuredRagFlowToolInput): void {
  structuredRagFlowInputSchema.parse(input);
}

export async function executeStructuredRagFlowTool(input: StructuredRagFlowToolInput) {
  try {
    validateStructuredRagFlowInput(input);
    return toolSuccess(await runStructuredRagFlow(input));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredRagFlowTool = tool({
  name: 'structured_rag_flow',
  description:
    'Run a guarded structured RAG flow: plan, optionally validate, evaluate readiness, and execute only if enabled and ready. This does not generate SQL or query databases directly.',
  inputSchema: structuredRagFlowInputSchema,
  callback: executeStructuredRagFlowTool,
});

export { structuredRagFlowTool };

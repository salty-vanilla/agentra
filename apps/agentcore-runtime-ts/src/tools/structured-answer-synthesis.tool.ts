import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { synthesizeStructuredAnswer } from '../rag/structured-answer-synthesis.js';
import type { StructuredAnswerSynthesisInput } from '../rag/structured-answer-synthesis-types.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_METADATA_KEYS = 100;

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

const structuredQueryExecutionStatusSchema = z.enum([
  'success',
  'empty',
  'error',
  'not_implemented',
]);

const structuredPlanReadinessStatusSchema = z.enum([
  'ready',
  'needs_clarification',
  'unsupported',
  'not_configured',
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
  issues: z.array(structuredQueryPlanValidationIssueSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredQueryPlanSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  intent: structuredQueryIntentSchema,
  dataSourceKind: structuredQueryDataSourceKindSchema,
  question: z.string().trim().min(1),
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
        operator: z.enum([
          'equals',
          'not_equals',
          'contains',
          'in',
          'greater_than',
          'greater_than_or_equals',
          'less_than',
          'less_than_or_equals',
        ]),
        value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.union([z.string(), z.number(), z.boolean()])),
        ]),
      }),
    )
    .optional(),
  metrics: z
    .array(
      z.enum([
        'count',
        'sum',
        'average',
        'min',
        'max',
        'rate',
        'trend',
        'top_n',
        'unknown',
      ]),
    )
    .optional(),
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

const structuredQueryRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const structuredQueryExecutionOutputSchema = z.object({
  plan: structuredQueryPlanSchema,
  status: structuredQueryExecutionStatusSchema,
  rows: z.array(structuredQueryRowSchema),
  summary: z.object({
    status: structuredQueryExecutionStatusSchema,
    rowCount: z.number().int().nonnegative(),
    columnNames: z.array(z.string()),
    dataSourceKind: structuredQueryDataSourceKindSchema,
    intent: structuredQueryIntentSchema,
    dryRun: z.boolean(),
    message: z.string().optional(),
  }),
  sources: z.array(z.record(z.string(), z.unknown())),
  citations: z.array(z.record(z.string(), z.unknown())),
  brief: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredPlanReadinessResultSchema = z.object({
  status: structuredPlanReadinessStatusSchema,
  recommendedProvider: z.enum([
    'bedrock_kb_structured',
    'mock',
    'athena_query_generator_future',
    'unknown',
  ]),
  nextAction: z.enum([
    'execute_bedrock_structured',
    'execute_mock',
    'ask_follow_up',
    'inspect_catalog',
    'fallback_to_kb_retrieve',
    'fallback_to_web_research',
    'not_supported',
  ]),
  executable: z.boolean(),
  missingSlots: z.array(z.string()),
  blockingIssues: z.array(structuredQueryPlanValidationIssueSchema),
  warnings: z.array(structuredQueryPlanValidationIssueSchema),
  rationale: z.array(z.string()),
  plan: structuredQueryPlanSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredRagFlowOutputSchema = z.object({
  status: z.enum([
    'planned',
    'validated',
    'ready',
    'executed',
    'needs_clarification',
    'not_configured',
    'unsupported',
    'error',
  ]),
  plan: structuredQueryPlanSchema,
  validation: structuredQueryPlanValidationResultSchema.optional(),
  readiness: structuredPlanReadinessResultSchema.optional(),
  execution: structuredQueryExecutionOutputSchema.optional(),
  nextAction: z.string().trim().min(1),
  messages: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredAnswerSynthesisInputSchema = z
  .object({
    flow: structuredRagFlowOutputSchema,
    tone: z.enum(['concise', 'detailed', 'executive', 'engineering']).optional(),
    includeRows: z.boolean().optional(),
    maxRows: z.number().int().min(0).max(50).optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((input, ctx) => {
    if (Object.keys(input.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['metadata'],
      });
    }

    if (
      input.flow.metadata &&
      Object.keys(input.flow.metadata).length > MAX_METADATA_KEYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `flow.metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['flow', 'metadata'],
      });
    }
  });

export type StructuredAnswerSynthesisToolInput = z.infer<
  typeof structuredAnswerSynthesisInputSchema
>;

function validateStructuredAnswerSynthesisInput(
  input: StructuredAnswerSynthesisToolInput,
): void {
  structuredAnswerSynthesisInputSchema.parse(input);
}

export function executeStructuredAnswerSynthesisTool(
  input: StructuredAnswerSynthesisToolInput,
) {
  try {
    validateStructuredAnswerSynthesisInput(input);
    return toolSuccess(
      synthesizeStructuredAnswer(input as StructuredAnswerSynthesisInput),
    );
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredAnswerSynthesisTool = tool({
  name: 'structured_answer_synthesis',
  description:
    'Create a deterministic answer payload from a StructuredRagFlowOutput. This does not call an LLM, generate SQL, or query databases.',
  inputSchema: structuredAnswerSynthesisInputSchema,
  callback: executeStructuredAnswerSynthesisTool,
});

export { structuredAnswerSynthesisTool };

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  BedrockKbStructuredProvider,
  type StructuredQueryExecutionInput,
  StructuredQueryExecutor,
} from '../rag/index.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_QUESTION_LENGTH = 2000;
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

const structuredQueryPlanSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  intent: structuredQueryIntentSchema,
  dataSourceKind: structuredQueryDataSourceKindSchema,
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
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

const structuredQueryExecuteBedrockStubInputSchema = z
  .object({
    plan: structuredQueryPlanSchema,
    dryRun: z.boolean().optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((input, ctx) => {
    if (Object.keys(input.plan.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plan', 'metadata'],
        message: `plan.metadata must not exceed ${MAX_METADATA_KEYS} keys`,
      });
    }

    if (Object.keys(input.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata'],
        message: `metadata must not exceed ${MAX_METADATA_KEYS} keys`,
      });
    }
  });

export type StructuredQueryExecuteBedrockStubToolInput = z.infer<
  typeof structuredQueryExecuteBedrockStubInputSchema
>;

export function resolveStructuredKbRegion(): string {
  return (
    process.env.BEDROCK_KB_STRUCTURED_REGION ??
    process.env.BEDROCK_KB_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    'us-east-1'
  );
}

export function validateStructuredQueryExecuteBedrockStubInput(
  input: StructuredQueryExecuteBedrockStubToolInput,
): void {
  structuredQueryExecuteBedrockStubInputSchema.parse(input);
}

export async function executeStructuredQueryExecuteBedrockStubTool(
  input: StructuredQueryExecuteBedrockStubToolInput,
) {
  try {
    validateStructuredQueryExecuteBedrockStubInput(input);
    const provider = new BedrockKbStructuredProvider({
      knowledgeBaseId: process.env.BEDROCK_KB_STRUCTURED_ID,
      region: resolveStructuredKbRegion(),
      dataSourceName: process.env.BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME,
      defaultDryRun: true,
    });
    const executor = new StructuredQueryExecutor(provider);
    return toolSuccess(await executor.execute(input as StructuredQueryExecutionInput));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredQueryExecuteBedrockStubTool = tool({
  name: 'structured_query_execute_bedrock_stub',
  description:
    'Validate wiring for a future Bedrock KB structured data provider. This returns an explicit not_implemented result and does not query Bedrock, generate SQL, or call a database.',
  inputSchema: structuredQueryExecuteBedrockStubInputSchema,
  callback: executeStructuredQueryExecuteBedrockStubTool,
});

export { structuredQueryExecuteBedrockStubTool };

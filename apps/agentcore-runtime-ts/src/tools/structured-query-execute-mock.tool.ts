import {
  StructuredQueryExecutor,
  MockStructuredQueryProvider,
  buildMockStructuredQueryOutput,
  type StructuredQueryPlan,
} from '../rag/index.js';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
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

const structuredQueryPlanSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  intent: structuredQueryIntentSchema,
  dataSourceKind: structuredQueryDataSourceKindSchema,
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  targetEntity: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  filters: z.array(z.unknown()).optional(),
  metrics: z.array(z.unknown()).optional(),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(z.unknown()).optional(),
  limit: z.number().int().positive().optional(),
  confidence: z.number(),
  assumptions: z.array(z.string()).optional(),
  missingSlots: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const structuredQueryExecuteMockInputSchema = z.object({
  plan: structuredQueryPlanSchema,
  dryRun: z.boolean().optional(),
  createBrief: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StructuredQueryExecuteMockToolInput = z.infer<
  typeof structuredQueryExecuteMockInputSchema
>;

export type StructuredQueryExecuteMockToolOutput = Awaited<
  ReturnType<typeof buildMockStructuredQueryOutput>
>;

function validateMetadataKeyCount(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateStructuredQueryExecuteMockInput(
  input: StructuredQueryExecuteMockToolInput,
): void {
  if (!input.plan.id.trim()) {
    throw new Error('plan.id must not be empty');
  }

  if (!input.plan.question.trim()) {
    throw new Error('plan.question must not be empty');
  }

  validateMetadataKeyCount(input.metadata);
  validateMetadataKeyCount(input.plan.metadata);
}

export function resolveStructuredQueryExecuteMockInput(
  input: StructuredQueryExecuteMockToolInput,
): StructuredQueryExecuteMockToolInput {
  validateStructuredQueryExecuteMockInput(input);
  return input;
}

export async function executeStructuredQueryExecuteMockTool(
  input: StructuredQueryExecuteMockToolInput,
) {
  try {
    const resolved = resolveStructuredQueryExecuteMockInput(input);
    const provider = new MockStructuredQueryProvider();
    const executor = new StructuredQueryExecutor(provider);
    const output = await executor.execute({
      plan: resolved.plan as StructuredQueryPlan,
      dryRun: resolved.dryRun,
      createBrief: resolved.createBrief,
      metadata: resolved.metadata,
    });

    return toolSuccess(output);
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredQueryExecuteMockTool = tool({
  name: 'structured_query_execute_mock',
  description:
    'Execute a StructuredQueryPlan against a deterministic mock structured data provider. This is for pipeline validation only and does not generate SQL or call a database.',
  inputSchema: structuredQueryExecuteMockInputSchema,
  callback: executeStructuredQueryExecuteMockTool,
});

export { structuredQueryExecuteMockTool };

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  createStructuredQueryPlan,
  type StructuredQueryFilterOperator,
} from '../rag/index.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_QUESTION_LENGTH = 2000;
const MAX_TARGET_ENTITY_LENGTH = 500;
const MAX_FILTER_FIELD_LENGTH = 200;
const MAX_STRING_LENGTH = 1000;
const MAX_FILTER_COUNT = 50;
const MAX_GROUP_BY_COUNT = 20;
const MAX_ORDER_BY_COUNT = 10;
const MAX_ARRAY_COUNT = 50;
const MAX_METADATA_KEYS = 100;

const structuredQueryIntentSchema = z.enum([
  'error_code_lookup',
  'temperature_anomaly_summary',
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

const structuredQueryPlanInputSchema = z.object({
  question: z.string(),
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

export type StructuredQueryPlanToolInput = z.infer<typeof structuredQueryPlanInputSchema>;

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateText(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
): void {
  const trimmed = trimText(value);
  if (trimmed === undefined) {
    throw new Error(`${fieldName} must not be empty`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
}

function validateOptionalText(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
): void {
  const trimmed = trimText(value);
  if (trimmed !== undefined && trimmed.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
}

function validateStringArray(
  values: string[] | undefined,
  fieldName: string,
  maxItems: number,
  maxLength: number = MAX_STRING_LENGTH,
): void {
  if (values === undefined) {
    return;
  }

  if (values.length > maxItems) {
    throw new Error(`${fieldName} must not exceed ${maxItems} items`);
  }

  values.forEach((value, index) => {
    const trimmed = trimText(value);
    if (trimmed !== undefined && trimmed.length > maxLength) {
      throw new Error(`${fieldName}[${index}] must not exceed ${maxLength} characters`);
    }
  });
}

function validateFilters(
  filters:
    | Array<{
        field: string;
        operator: StructuredQueryFilterOperator;
        value: string | number | boolean | Array<string | number | boolean>;
      }>
    | undefined,
): void {
  if (filters === undefined) {
    return;
  }

  if (filters.length > MAX_FILTER_COUNT) {
    throw new Error(`filters must not exceed ${MAX_FILTER_COUNT} items`);
  }

  filters.forEach((filter, index) => {
    validateText(filter.field, `filters[${index}].field`, MAX_FILTER_FIELD_LENGTH);

    if (Array.isArray(filter.value)) {
      if (filter.value.length > MAX_ARRAY_COUNT) {
        throw new Error(
          `filters[${index}].value must not exceed ${MAX_ARRAY_COUNT} items`,
        );
      }

      filter.value.forEach((item, valueIndex) => {
        if (typeof item === 'string' && item.trim().length > MAX_STRING_LENGTH) {
          throw new Error(
            `filters[${index}].value[${valueIndex}] must not exceed ${MAX_STRING_LENGTH} characters`,
          );
        }
      });
      return;
    }

    if (
      typeof filter.value === 'string' &&
      filter.value.trim().length > MAX_STRING_LENGTH
    ) {
      throw new Error(
        `filters[${index}].value must not exceed ${MAX_STRING_LENGTH} characters`,
      );
    }
  });
}

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateStructuredQueryPlanInput(input: StructuredQueryPlanToolInput): void {
  validateText(input.question, 'question', MAX_QUESTION_LENGTH);
  validateOptionalText(input.targetEntity, 'targetEntity', MAX_TARGET_ENTITY_LENGTH);
  validateFilters(input.filters);
  validateStringArray(input.groupBy, 'groupBy', MAX_GROUP_BY_COUNT, MAX_STRING_LENGTH);
  validateStringArray(
    input.assumptions,
    'assumptions',
    MAX_ARRAY_COUNT,
    MAX_STRING_LENGTH,
  );
  validateStringArray(input.notes, 'notes', MAX_ARRAY_COUNT, MAX_STRING_LENGTH);
  if ((input.orderBy?.length ?? 0) > MAX_ORDER_BY_COUNT) {
    throw new Error(`orderBy must not exceed ${MAX_ORDER_BY_COUNT} items`);
  }
  validateMetadata(input.metadata);
}

export function executeStructuredQueryPlanTool(input: StructuredQueryPlanToolInput) {
  try {
    validateStructuredQueryPlanInput(input);
    return toolSuccess(createStructuredQueryPlan(input));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const structuredQueryPlanTool = tool({
  name: 'structured_query_plan',
  description:
    'Create a deterministic structured query plan for structured RAG use cases such as error code lookup, temperature anomaly summaries, KPI aggregation, equipment history lookup, and production trends. This does not generate or execute SQL.',
  inputSchema: structuredQueryPlanInputSchema,
  callback: executeStructuredQueryPlanTool,
});

export { structuredQueryPlanTool };

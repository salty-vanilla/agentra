import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  createKbQueryPlan,
  evaluateKbRetrievalReadiness,
} from '../rag/index.js';
import type { KbQueryPlan } from '../rag/kb-query-planning-types.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_QUERY_LENGTH = 2000;
const MAX_METADATA_KEYS = 100;
const MAX_HINT_COUNT = 50;
const MAX_STRING_LENGTH = 1000;

const kbRetrievalIntentSchema = z.enum([
  'document_lookup',
  'how_to',
  'troubleshooting',
  'policy_lookup',
  'spec_lookup',
  'comparison',
  'summary',
  'unknown',
]);

const kbQueryPlanSchema = z.object({
  id: z.string(),
  createdAt: z.string().trim().min(1),
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  intent: kbRetrievalIntentSchema,
  topK: z.number().int().min(1).max(20),
  scoreThreshold: z.number().min(0).max(1).optional(),
  queryRewriteHint: z.string().max(MAX_STRING_LENGTH).optional(),
  expectedSourceTypes: z.array(z.string().trim().min(1).max(MAX_STRING_LENGTH)).optional(),
  metadataFilterHints: z.array(z.string().trim().min(1).max(MAX_STRING_LENGTH)).optional(),
  missingContext: z.array(z.string().trim().min(1).max(MAX_STRING_LENGTH)).optional(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const kbQueryPlanInputSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  intent: kbRetrievalIntentSchema.optional(),
  topK: z.number().int().min(1).max(20).optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
  queryRewriteHint: z.string().max(MAX_STRING_LENGTH).optional(),
  expectedSourceTypes: z
    .array(z.string().trim().min(1).max(MAX_STRING_LENGTH))
    .max(MAX_HINT_COUNT)
    .optional(),
  metadataFilterHints: z
    .array(z.string().trim().min(1).max(MAX_STRING_LENGTH))
    .max(MAX_HINT_COUNT)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const kbQueryReadinessInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH).optional(),
    plan: kbQueryPlanSchema.optional(),
    planInput: kbQueryPlanInputSchema.optional(),
    kbRetrieveEnabled: z.boolean().optional(),
    knowledgeBaseConfigured: z.boolean().optional(),
    allowWebFallback: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.plan === undefined && input.planInput === undefined && input.query === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'query, plan, or planInput must be provided',
      });
    }
  });

export type KbQueryReadinessToolInput = z.infer<typeof kbQueryReadinessInputSchema>;
export type KbQueryPlanInput = z.infer<typeof kbQueryPlanInputSchema>;
export type KbQueryPlanSchema = z.infer<typeof kbQueryPlanSchema>;

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function resolvePlan(input: KbQueryReadinessToolInput) {
  if (input.plan !== undefined) {
    return input.plan;
  }

  if (input.planInput !== undefined) {
    return createKbQueryPlan(input.planInput);
  }

  if (input.query !== undefined) {
    return createKbQueryPlan({ query: input.query });
  }

  throw new Error('query, plan, or planInput must be provided');
}

function validatePlan(plan: KbQueryPlan): void {
  validateMetadata(plan.metadata);
}

function validateInputMetadata(metadata: Record<string, unknown> | undefined): void {
  validateMetadata(metadata);
}

export function executeKbQueryReadinessTool(input: KbQueryReadinessToolInput) {
  try {
    const validatedInput = kbQueryReadinessInputSchema.parse(input);
    const plan = resolvePlan(validatedInput);

    validatePlan(plan);
    validateInputMetadata(validatedInput.metadata);

    return toolSuccess({
      plan,
      readiness: evaluateKbRetrievalReadiness({
        plan,
        kbRetrieveEnabled: validatedInput.kbRetrieveEnabled,
        knowledgeBaseConfigured: validatedInput.knowledgeBaseConfigured,
        allowWebFallback: validatedInput.allowWebFallback,
        metadata: validatedInput.metadata,
      }),
    });
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const kbQueryReadinessTool = tool({
  name: 'kb_query_readiness',
  description:
    'Create or accept a deterministic KB retrieval plan and evaluate whether KB retrieval is ready, needs clarification, or should fall back to web research. This does not retrieve documents or call AWS.',
  inputSchema: kbQueryReadinessInputSchema,
  callback: executeKbQueryReadinessTool,
});

export {
  kbQueryPlanInputSchema,
  kbQueryPlanSchema,
  kbQueryReadinessInputSchema,
  kbQueryReadinessTool,
};

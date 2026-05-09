import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { runKbRagFlow } from '../rag/kb-rag-flow.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_QUERY_LENGTH = 2000;
const MAX_METADATA_KEYS = 100;
const MAX_ARRAY_COUNT = 50;

const questionSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_QUERY_LENGTH, `query must not exceed ${MAX_QUERY_LENGTH} characters`);

const planInputSchema = z
  .object({
    query: questionSchema,
    intent: z
      .enum([
        'document_lookup',
        'how_to',
        'troubleshooting',
        'policy_lookup',
        'spec_lookup',
        'comparison',
        'summary',
        'unknown',
      ])
      .optional(),
    topK: z.number().int().min(1).max(20).optional(),
    scoreThreshold: z.number().min(0).max(1).optional(),
    queryRewriteHint: z.string().max(1000).optional(),
    expectedSourceTypes: z.array(z.string()).max(MAX_ARRAY_COUNT).optional(),
    metadataFilterHints: z.array(z.string()).max(MAX_ARRAY_COUNT).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const planSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    query: questionSchema,
    intent: z
      .enum([
        'document_lookup',
        'how_to',
        'troubleshooting',
        'policy_lookup',
        'spec_lookup',
        'comparison',
        'summary',
        'unknown',
      ])
      .optional()
      .default('document_lookup'),
    topK: z.number().int().min(1).max(20),
    scoreThreshold: z.number().min(0).max(1).optional(),
    queryRewriteHint: z.string().max(1000).optional(),
    expectedSourceTypes: z.array(z.string()).max(MAX_ARRAY_COUNT).optional(),
    metadataFilterHints: z.array(z.string()).max(MAX_ARRAY_COUNT).optional(),
    missingContext: z.array(z.string()).max(MAX_ARRAY_COUNT).optional(),
    confidence: z.number().min(0).max(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const kbRagFlowInputSchema = z
  .object({
    query: questionSchema.optional(),
    plan: planSchema.optional(),
    planInput: planInputSchema.optional(),
    mode: z.enum(['plan_only', 'readiness_only', 'retrieve_if_ready']).optional(),
    kbRetrieveEnabled: z.boolean().optional(),
    knowledgeBaseConfigured: z.boolean().optional(),
    allowWebFallback: z.boolean().optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.query === undefined &&
      input.plan === undefined &&
      input.planInput === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of query, plan, or planInput.',
        path: ['query'],
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
  });

export type KbRagFlowToolInput = z.infer<typeof kbRagFlowInputSchema>;

function validateKbRagFlowInput(input: KbRagFlowToolInput): void {
  kbRagFlowInputSchema.parse(input);
}

export async function executeKbRagFlowTool(input: KbRagFlowToolInput) {
  try {
    validateKbRagFlowInput(input);
    return toolSuccess(await runKbRagFlow(input));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const kbRagFlowTool = tool({
  name: 'kb_rag_flow',
  description:
    'Run a guarded normal KB RAG flow: plan, evaluate readiness, and retrieve only when configured and ready.',
  inputSchema: kbRagFlowInputSchema,
  callback: executeKbRagFlowTool,
});

export { kbRagFlowTool };

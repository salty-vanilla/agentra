import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { synthesizeKbAnswer } from '../rag/kb-answer-synthesis.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_METADATA_KEYS = 100;

const evidenceSourceTypeSchema = z.enum([
  'web',
  'document',
  'structured_data',
  'tool_result',
  'artifact',
  'unknown',
]);

const evidenceSourceSchema = z
  .object({
    id: z.string().trim().min(1),
    type: evidenceSourceTypeSchema,
    title: z.string().optional(),
    url: z.string().optional(),
    uri: z.string().optional(),
    snippet: z.string().optional(),
    retrievedAt: z.string().trim().min(1),
    score: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const citationSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    type: evidenceSourceTypeSchema,
    title: z.string().optional(),
    url: z.string().optional(),
    uri: z.string().optional(),
  })
  .passthrough();

const briefSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    language: z.enum(['ja', 'en', 'unknown']).optional(),
    audience: z.enum(['executive', 'engineer', 'sales', 'general', 'unknown']).optional(),
    outputFormat: z
      .enum(['chat', 'presentation', 'report', 'json', 'unknown'])
      .optional(),
    topic: z.string().optional(),
    goal: z.string().optional(),
    constraints: z.array(z.string()).optional(),
    keyFacts: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
    sourceIds: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const retrievalSchema = z
  .object({
    query: z.string().optional(),
    provider: z.string().optional(),
    sources: z.array(evidenceSourceSchema),
    citations: z.array(citationSchema),
    brief: briefSchema.optional(),
    rawResultSummary: z
      .object({
        resultCount: z.number().int().nonnegative(),
        originalResultCount: z.number().int().nonnegative().optional(),
        filteredByScoreCount: z.number().int().nonnegative().optional(),
        noResults: z.boolean().optional(),
      })
      .strict(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const kbAnswerSynthesisInputSchema = z
  .object({
    flow: z
      .object({
        status: z.enum([
          'answer_ready',
          'needs_clarification',
          'not_configured',
          'fallback_recommended',
          'error',
        ]),
        retrieval: retrievalSchema.optional(),
        nextAction: z.string().optional(),
        messages: z.array(z.string()).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    includeSourcePreview: z.boolean().optional(),
    maxSources: z.number().int().min(1).max(20).optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Object.keys(input.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['metadata'],
      });
    }

    if (Object.keys(input.flow.metadata ?? {}).length > MAX_METADATA_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `flow.metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['flow', 'metadata'],
      });
    }
  });

export type KbAnswerSynthesisToolInput = z.infer<typeof kbAnswerSynthesisInputSchema>;

function validateKbAnswerSynthesisInput(input: KbAnswerSynthesisToolInput): void {
  kbAnswerSynthesisInputSchema.parse(input);
}

export function executeKbAnswerSynthesisTool(input: KbAnswerSynthesisToolInput) {
  try {
    validateKbAnswerSynthesisInput(input);
    return toolSuccess(synthesizeKbAnswer(input));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const kbAnswerSynthesisTool = tool({
  name: 'kb_answer_synthesis',
  description:
    'Create a deterministic answer payload from a KB RAG flow result. This does not call an LLM or retrieve documents.',
  inputSchema: kbAnswerSynthesisInputSchema,
  callback: executeKbAnswerSynthesisTool,
});

export { kbAnswerSynthesisTool };

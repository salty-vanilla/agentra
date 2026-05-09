import { z } from 'zod';
import {
  subAgentHandoffOutputSchema,
  subAgentHandoffStatusSchema,
} from '../handoff-types.js';

const MAX_QUESTION_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 8000;
const MAX_METADATA_KEYS = 100;

export const manufacturingLineAgentHandoffInputSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    context: z.string().trim().max(MAX_CONTEXT_LENGTH).optional(),
    mode: z.enum(['auto', 'kb', 'structured', 'both', 'diagnostics']).optional(),
    requireCitations: z.boolean().optional(),
    createBrief: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.metadata !== undefined &&
      Object.keys(value.metadata).length > MAX_METADATA_KEYS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must not exceed ${MAX_METADATA_KEYS} keys`,
        path: ['metadata'],
      });
    }
  });

export const manufacturingLineAgentHandoffOutputSchema = z.object({
  status: subAgentHandoffStatusSchema,
  agentKind: z.literal('manufacturing_line').optional(),
  agentName: z.string().trim().min(1).optional(),
  handoffMode: z.string().trim().min(1).optional(),
  answer: z.string(),
  sources: z.array(z.unknown()).optional(),
  citations: z.array(z.unknown()).optional(),
  brief: z.unknown().optional(),
  caveats: z.array(z.string()).optional(),
  nextActions: z.array(z.string()).optional(),
  metadata: subAgentHandoffOutputSchema.shape.metadata,
});

export type ManufacturingLineAgentHandoffInput = z.infer<
  typeof manufacturingLineAgentHandoffInputSchema
>;

export type ManufacturingLineAgentHandoffOutput = z.infer<
  typeof manufacturingLineAgentHandoffOutputSchema
>;

export function buildManufacturingLineAgentHandoffPrompt(
  input: ManufacturingLineAgentHandoffInput,
): string {
  const parts = [
    'You are preparing a focused handoff for the Manufacturing Line Agent.',
    'Return a single JSON object that matches the requested handoff output shape.',
    'Use the manufacturing-line system prompt and answer with the most complete evidence-backed response you can.',
    '',
    `Mode: ${input.mode ?? 'auto'}`,
    `Require citations: ${input.requireCitations ? 'yes' : 'no'}`,
    `Create brief: ${input.createBrief ? 'yes' : 'no'}`,
    '',
    'User question:',
    input.question,
  ];

  if (input.context) {
    parts.push('', 'Additional context:', input.context);
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    parts.push('', 'Metadata:', JSON.stringify(input.metadata, null, 2));
  }

  parts.push(
    '',
    'Requirements:',
    '- status must be one of success, needs_clarification, not_configured, no_results, fallback_recommended, or error',
    '- answer must be a concise natural-language response',
    '- include agentKind, agentName, and handoffMode when available',
    '- include sources, citations, brief, caveats, nextActions, and metadata when available',
    '- if the question needs clarification, ask the minimum clarifying question in answer and set status to needs_clarification',
    '- if the requested mode cannot be served, explain that in answer and set status appropriately',
  );

  return parts.join('\n');
}

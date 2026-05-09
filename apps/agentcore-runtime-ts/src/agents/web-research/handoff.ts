import { z } from 'zod';

const MAX_QUESTION_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 8000;
const MAX_DOMAIN_COUNT = 50;
const MAX_DOMAIN_LENGTH = 253;
const MAX_METADATA_KEYS = 100;

const domainSchema = z.string().trim().min(1).max(MAX_DOMAIN_LENGTH);

export const webResearchAgentHandoffInputSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    context: z.string().trim().max(MAX_CONTEXT_LENGTH).optional(),
    freshnessRequired: z.boolean().optional(),
    allowedDomains: z.array(domainSchema).max(MAX_DOMAIN_COUNT).optional(),
    blockedDomains: z.array(domainSchema).max(MAX_DOMAIN_COUNT).optional(),
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

export const webResearchAgentHandoffOutputSchema = z.object({
  status: z.enum(['success', 'needs_clarification', 'no_results', 'error']),
  answer: z.string(),
  sources: z.array(z.unknown()).optional(),
  citations: z.array(z.unknown()).optional(),
  brief: z.unknown().optional(),
  caveats: z.array(z.string()).optional(),
  nextActions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WebResearchAgentHandoffInput = z.infer<
  typeof webResearchAgentHandoffInputSchema
>;

export type WebResearchAgentHandoffOutput = z.infer<
  typeof webResearchAgentHandoffOutputSchema
>;

export function buildWebResearchAgentHandoffPrompt(
  input: WebResearchAgentHandoffInput,
): string {
  const parts = [
    'You are preparing a focused handoff for the Web Research Agent.',
    'Return a single JSON object that matches the requested handoff output shape.',
    'Use the web research system prompt and answer with the most complete evidence-backed response you can.',
    'Prefer public, current, or external sources and respect the domain constraints when provided.',
    '',
    `Freshness required: ${input.freshnessRequired ? 'yes' : 'no'}`,
    `Require citations: ${input.requireCitations ? 'yes' : 'no'}`,
    `Create brief: ${input.createBrief ? 'yes' : 'no'}`,
    '',
    'User question:',
    input.question,
  ];

  if (input.context) {
    parts.push('', 'Additional context:', input.context);
  }

  if (input.allowedDomains && input.allowedDomains.length > 0) {
    parts.push('', 'Allowed domains:', input.allowedDomains.join(', '));
  }

  if (input.blockedDomains && input.blockedDomains.length > 0) {
    parts.push('', 'Blocked domains:', input.blockedDomains.join(', '));
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    parts.push('', 'Metadata:', JSON.stringify(input.metadata, null, 2));
  }

  parts.push(
    '',
    'Requirements:',
    '- status must be one of success, needs_clarification, no_results, or error',
    '- answer must be a concise natural-language response',
    '- include sources, citations, brief, caveats, nextActions, and metadata when available',
    '- if the question needs clarification, ask the minimum clarifying question in answer and set status to needs_clarification',
    '- if there are no relevant public results, set status to no_results and explain what was checked',
    '- if the question is time-sensitive, call out freshness caveats clearly',
  );

  return parts.join('\n');
}

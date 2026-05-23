import { z } from 'zod';

export const RequestSchema = z.object({
  prompt: z.string().trim().min(1).default('Hello! How can I help you today?'),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  preset: z.enum(['fast', 'balanced', 'deep']).default('balanced'),
  tone: z.enum(['business', 'engineer']).default('business'),
  length: z.enum(['short', 'normal', 'detailed']).default('normal'),
  commandDirective: z.string().optional(),
  traceId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
});

export type ParsedRuntimeRequest = z.infer<typeof RequestSchema>;

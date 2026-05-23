import { z } from 'zod';
import {
  GetThreadResponse,
  ListThreadMessagesResponse,
} from './generated/openapi-zod.js';

export const threadSummarySchema = GetThreadResponse.shape.thread;
export const persistedChatMessageSchema =
  ListThreadMessagesResponse.shape.messages.element;

const chatObservationToolCallSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const chatObservationSummarySchema = z.object({
  traceId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  tokenUsage: z
    .object({
      inputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0),
    })
    .optional(),
  reasoning: z
    .object({
      stepCount: z.number().int().min(0),
      summary: z.string().optional(),
    })
    .optional(),
  toolCalls: z.array(chatObservationToolCallSchema),
  toolCallCount: z.number().int().min(0),
  toolFailureCount: z.number().int().min(0),
});

export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type PersistedChatMessage = z.infer<typeof persistedChatMessageSchema>;
export type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;

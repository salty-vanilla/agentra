import { z } from 'zod';
import {
  PostChatBody,
  CreateThreadBody,
  GetHealthResponse,
  GetThreadResponse,
  ListThreadMessagesResponse,
  ListThreadsResponse,
  UpdateThreadBody,
} from './generated/openapi-zod.js';

const postChatHistorySchema = PostChatBody.shape.history.unwrap();
const postChatMessageSchema = postChatHistorySchema.element;
const threadSummarySchemaInternal = GetThreadResponse.shape.thread;
const persistedChatMessageSchemaInternal =
  ListThreadMessagesResponse.shape.messages.element;

export {
  CreateThreadBody as createThreadRequestSchema,
  GetHealthResponse as healthResponseSchema,
  GetThreadResponse as threadResponseSchema,
  ListThreadMessagesResponse as threadMessagesResponseSchema,
  ListThreadsResponse as threadsResponseSchema,
  UpdateThreadBody as updateThreadRequestSchema,
};

// ---------------------------------------------------------------------------
// ChatCommand — structured command payload for explicit UI actions
// ---------------------------------------------------------------------------
export const chatCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_slide_presentation'),
    topic: z.string().trim().min(1),
    audience: z
      .enum(['executive', 'manager', 'engineer', 'operator', 'customer', 'general'])
      .or(z.string().min(1))
      .optional(),
    purpose: z
      .enum(['report', 'proposal', 'decision', 'knowledge_share', 'training'])
      .or(z.string().min(1))
      .optional(),
    slideCount: z.union([z.number().int().min(1), z.literal('auto')]).optional(),
    durationMinutes: z.union([z.number().int().min(1), z.literal('auto')]).optional(),
    language: z.enum(['ja', 'en']).optional(),
    tone: z
      .enum(['executive', 'technical', 'sales', 'simple'])
      .or(z.string().min(1))
      .optional(),
    outputFormat: z.literal('pptx').optional(),
    template: z
      .object({
        brandFrameId: z.string().min(1).optional(),
      })
      .optional(),
    icons: z
      .object({
        enabled: z.boolean().optional(),
        providerId: z.literal('lucide-local').optional(),
        preferredIconIds: z.array(z.string().min(1)).optional(),
      })
      .optional(),
  }),
]);

export const chatRequestSchema = PostChatBody.extend({
  command: chatCommandSchema.optional(),
});

// ---------------------------------------------------------------------------
// ProgressSummaryEvent — public task progress for long-running operations
// ---------------------------------------------------------------------------
export const progressPhaseSchema = z.enum([
  'request_understanding',
  'router_handoff',
  'outline',
  'authoring',
  'pptx_generation',
  'rendering',
  'diagnostics',
  'revision',
  'upload',
  'done',
  'error',
]);

export const progressSummaryEventSchema = z.object({
  type: z.literal('progress_summary'),
  phase: progressPhaseSchema,
  title: z.string(),
  summary: z.string(),
  details: z.array(z.string()).optional(),
  timestamp: z.string(),
});
const chatStreamProgressSummaryEventSchema = z.object({
  type: z.literal('progress_summary'),
  event: progressSummaryEventSchema,
});
const chatStreamTextEventSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
const chatObservationToolCallSchema = z.object({
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().min(1).optional(),
});
const chatObservationSummarySchema = z.object({
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
const chatStreamObservationEventSchema = z.object({
  type: z.literal('observation'),
  observation: chatObservationSummarySchema,
});
const chatStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  threadId: z.string().min(1),
  model: z.string().min(1),
  createdAt: z.string().datetime(),
  observabilitySummary: chatObservationSummarySchema.optional(),
});
const chatStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string().min(1),
  observabilitySummary: chatObservationSummarySchema.optional(),
});
export const chatStreamEventSchema = z.union([
  chatStreamTextEventSchema,
  chatStreamProgressSummaryEventSchema,
  chatStreamObservationEventSchema,
  chatStreamDoneEventSchema,
  chatStreamErrorEventSchema,
]);

export type ChatRole = z.infer<typeof postChatMessageSchema.shape.role>;
export type ChatMessage = z.infer<typeof postChatMessageSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchemaInternal>;
export type PersistedChatMessage = z.infer<typeof persistedChatMessageSchemaInternal>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export type ProgressPhase = z.infer<typeof progressPhaseSchema>;
export type ProgressSummaryEvent = z.infer<typeof progressSummaryEventSchema>;
export type ChatObservationToolCall = z.infer<typeof chatObservationToolCallSchema>;
export type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

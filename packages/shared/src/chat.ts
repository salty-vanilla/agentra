import { z } from 'zod';
import {
  CreateThreadBody,
  GetHealthResponse,
  GetThreadResponse,
  ListThreadMessagesResponse,
  ListThreadsResponse,
  PostChatBody,
  UpdateThreadBody,
} from './generated/openapi-zod.js';

const postChatHistorySchema = PostChatBody.shape.history.unwrap();
const postChatMessageSchema = postChatHistorySchema.element;
const threadSummarySchemaInternal = GetThreadResponse.shape.thread;
const persistedChatMessageSchemaInternal =
  ListThreadMessagesResponse.shape.messages.element;

export const chatRoleSchema = postChatMessageSchema.shape.role;
export const chatMessageSchema = postChatMessageSchema;
export const threadSummarySchema = threadSummarySchemaInternal;
export const persistedChatMessageSchema = persistedChatMessageSchemaInternal;
export const chatRequestSchema = PostChatBody;
export const chatStreamTextEventSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export const chatObservationToolCallSchema = z.object({
  toolName: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'error', 'cancelled']),
  error: z.string().min(1).optional(),
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
export const chatStreamObservationEventSchema = z.object({
  type: z.literal('observation'),
  observation: chatObservationSummarySchema,
});
export const chatStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  threadId: z.string().min(1),
  model: z.string().min(1),
  createdAt: z.string().datetime(),
  observabilitySummary: chatObservationSummarySchema.optional(),
});
export const chatStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string().min(1),
});
export const chatStreamEventSchema = z.union([
  chatStreamTextEventSchema,
  chatStreamObservationEventSchema,
  chatStreamDoneEventSchema,
  chatStreamErrorEventSchema,
]);
export const healthResponseSchema = GetHealthResponse;
export const threadsResponseSchema = ListThreadsResponse;
export const threadResponseSchema = GetThreadResponse;
export const createThreadRequestSchema = CreateThreadBody;
export const threadMessagesResponseSchema = ListThreadMessagesResponse;
export const updateThreadRequestSchema = UpdateThreadBody;

export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type PersistedChatMessage = z.infer<typeof persistedChatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatStreamTextEvent = z.infer<typeof chatStreamTextEventSchema>;
export type ChatObservationToolCall = z.infer<typeof chatObservationToolCallSchema>;
export type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;
export type ChatStreamObservationEvent = z.infer<typeof chatStreamObservationEventSchema>;
export type ChatStreamDoneEvent = z.infer<typeof chatStreamDoneEventSchema>;
export type ChatStreamErrorEvent = z.infer<typeof chatStreamErrorEventSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ThreadsResponse = z.infer<typeof threadsResponseSchema>;
export type ThreadResponse = z.infer<typeof threadResponseSchema>;
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;
export type ThreadMessagesResponse = z.infer<typeof threadMessagesResponseSchema>;
export type UpdateThreadRequest = z.infer<typeof updateThreadRequestSchema>;

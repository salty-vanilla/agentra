import type { z } from 'zod';
import {
  CreateThreadBody,
  GetHealthResponse,
  GetThreadResponse,
  ListThreadMessagesResponse,
  ListThreadsResponse,
  PostChatBody,
  PostChatResponse,
  UpdateThreadBody,
} from './generated/openapi-zod.js';

const postChatHistorySchema = PostChatBody.shape.history.unwrap();
const postChatMessageSchema = postChatHistorySchema.element;
const threadSummarySchemaInternal = GetThreadResponse.shape.thread;
const persistedChatMessageSchemaInternal = ListThreadMessagesResponse.shape.messages.element;

export const chatRoleSchema = postChatMessageSchema.shape.role;
export const chatMessageSchema = postChatMessageSchema;
export const threadSummarySchema = threadSummarySchemaInternal;
export const persistedChatMessageSchema = persistedChatMessageSchemaInternal;
export const chatRequestSchema = PostChatBody;
export const chatResponseSchema = PostChatResponse;
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
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ThreadsResponse = z.infer<typeof threadsResponseSchema>;
export type ThreadResponse = z.infer<typeof threadResponseSchema>;
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;
export type ThreadMessagesResponse = z.infer<typeof threadMessagesResponseSchema>;
export type UpdateThreadRequest = z.infer<typeof updateThreadRequestSchema>;

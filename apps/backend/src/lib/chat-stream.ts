import { ListThreadMessagesResponse } from '@agentra/shared';
import { z } from 'zod';

const chatObservationSummarySchema =
  ListThreadMessagesResponse.shape.messages.element.shape.observabilitySummary.unwrap();

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

export const chatStreamProgressSummaryEventSchema = z.object({
  type: z.literal('progress_summary'),
  event: progressSummaryEventSchema,
});

export const subAgentProgressEventSchema = z.object({
  type: z.literal('sub_agent_progress'),
  stage: z.string().min(1),
  status: z.enum(['running', 'complete', 'error']),
  durationMs: z.number().int().min(0).optional(),
  timestamp: z.string(),
});

export const chatStreamSubAgentProgressEventSchema = z.object({
  type: z.literal('sub_agent_progress'),
  event: subAgentProgressEventSchema,
});

export const chatStreamThreadStartedEventSchema = z.object({
  type: z.literal('thread_started'),
  threadId: z.string().min(1),
});

export const chatStreamTextEventSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const chatStreamObservationEventSchema = z.object({
  type: z.literal('observation'),
  observation: chatObservationSummarySchema,
});

export const chatStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  threadId: z.string().min(1),
  requestId: z.string().min(1),
  model: z.string().min(1),
  createdAt: z.string().datetime(),
  observabilitySummary: chatObservationSummarySchema.optional(),
});

export const chatStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  threadId: z.string().min(1).optional(),
  requestId: z.string().min(1),
  error: z.string().min(1),
  observabilitySummary: chatObservationSummarySchema.optional(),
});

export const chatStreamCancelledEventSchema = z.object({
  type: z.literal('cancelled'),
  threadId: z.string().min(1),
  requestId: z.string().min(1),
  observabilitySummary: chatObservationSummarySchema.optional(),
});

export const chatStreamEventSchema = z.union([
  chatStreamThreadStartedEventSchema,
  chatStreamTextEventSchema,
  chatStreamProgressSummaryEventSchema,
  chatStreamSubAgentProgressEventSchema,
  chatStreamObservationEventSchema,
  chatStreamDoneEventSchema,
  chatStreamErrorEventSchema,
  chatStreamCancelledEventSchema,
]);

export type ProgressSummaryEvent = z.infer<typeof progressSummaryEventSchema>;
export type SubAgentProgressEvent = z.infer<typeof subAgentProgressEventSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;

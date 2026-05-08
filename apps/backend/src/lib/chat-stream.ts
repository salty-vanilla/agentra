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
  model: z.string().min(1),
  createdAt: z.string().datetime(),
  observabilitySummary: chatObservationSummarySchema.optional(),
});

export const chatStreamErrorEventSchema = z.object({
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

export type ProgressSummaryEvent = z.infer<typeof progressSummaryEventSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type ChatObservationSummary = z.infer<typeof chatObservationSummarySchema>;

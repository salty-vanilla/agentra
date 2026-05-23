import { z } from 'zod';

export const subAgentKindValues = [
  'manufacturing_line',
  'web_research',
  'presentation',
  'unknown',
] as const;

export const subAgentHandoffStatusValues = [
  'success',
  'needs_clarification',
  'not_configured',
  'no_results',
  'fallback_recommended',
  'error',
] as const;

export const subAgentKindSchema = z.enum(subAgentKindValues);
export const subAgentHandoffStatusSchema = z.enum(subAgentHandoffStatusValues);

export const subAgentHandoffMetadataSchema = z
  .object({
    traceId: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional(),
    handoffMode: z.string().trim().min(1).optional(),
    parentAgent: z.string().trim().min(1).optional(),
    childAgent: z.string().trim().min(1).optional(),
    handoffTool: z.string().trim().min(1).optional(),
    rawValueType: z.string().trim().min(1).optional(),
    rawValuePreview: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const subAgentHandoffMetadataSummarySchema = z
  .object({
    selectedModelId: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    sourceCount: z.number().int().min(0).optional(),
    citationCount: z.number().int().min(0).optional(),
    resultCount: z.number().int().min(0).optional(),
    hasAnswer: z.boolean().optional(),
    hasRawContent: z.boolean().optional(),
  })
  .passthrough();

export const subAgentHandoffOutputSchema = z.object({
  status: subAgentHandoffStatusSchema,
  agentKind: subAgentKindSchema.optional(),
  agentName: z.string().trim().min(1).optional(),
  handoffMode: z.string().trim().min(1).optional(),
  answer: z.string(),
  usedSourceIds: z.array(z.string().trim().min(1)).optional(),
  sources: z.array(z.unknown()).optional(),
  citations: z.array(z.unknown()).optional(),
  brief: z.unknown().optional(),
  caveats: z.array(z.string()).optional(),
  nextActions: z.array(z.string()).optional(),
  metadataSummary: subAgentHandoffMetadataSummarySchema.optional(),
  metadata: subAgentHandoffMetadataSchema.optional(),
});

export type SubAgentKind = z.infer<typeof subAgentKindSchema>;
export type SubAgentHandoffStatus = z.infer<typeof subAgentHandoffStatusSchema>;
export type SubAgentHandoffMetadata = z.infer<typeof subAgentHandoffMetadataSchema>;
export type SubAgentHandoffMetadataSummary = z.infer<
  typeof subAgentHandoffMetadataSummarySchema
>;
export type SubAgentHandoffOutput = z.infer<typeof subAgentHandoffOutputSchema>;

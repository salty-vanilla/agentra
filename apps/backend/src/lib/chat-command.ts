import { z } from 'zod';

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

export type ChatCommand = z.infer<typeof chatCommandSchema>;

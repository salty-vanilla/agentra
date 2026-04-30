import { z } from 'zod';

export const DeckForgeRequestSchema = z.object({
  goal: z.string().trim().min(1),
  mode: z.enum(['create', 'modify']).default('create'),
  exportFormat: z.enum(['pptx', 'html', 'json', 'pdf']).default('pptx'),
  validationLevel: z.enum(['basic', 'strict', 'export']).default('export'),
  acquisitionMode: z.enum(['generate', 'retrieve', 'auto']).default('generate'),
  imageProvider: z.enum(['pexels', 'unsplash', 'pixabay']).default('pexels'),
  autoFix: z.boolean().default(true),
  revisionPolicy: z
    .enum(['none', 'validation_only', 'ai_review'])
    .default('validation_only'),
  reviewTrigger: z.enum(['errors', 'warnings', 'always']).default('warnings'),
  renderSlideImages: z.boolean().default(false),
  includeTrace: z.boolean().default(false),
  presentation: z.unknown().optional(),
  operations: z.array(z.unknown()).optional(),
  traceId: z.string().trim().min(1).optional(),
});

export type DeckForgeRequest = z.infer<typeof DeckForgeRequestSchema>;

import { z } from 'zod';

const baseSchema = z.object({
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
  /**
   * Persist a vision-review report alongside the deck (no IR mutation).
   */
  visionReview: z.boolean().default(false),
  /**
   * Backwards-compatible flag: when true, the runtime runs at least one
   * design-review loop iteration. Internally this is normalized into
   * `designReviewIterations >= 1`.
   */
  visionRevision: z.boolean().default(false),
  /**
   * Run a single Bedrock-backed `SlideDesigner` pass against the freshly
   * built IR before any review loop runs.
   */
  designPass: z.boolean().default(false),
  /**
   * Number of `runDesignReviewLoop` iterations (designer → render →
   * visualReviewer → applyOps). 0 disables the loop. Capped at 3 to keep
   * latency bounded.
   */
  designReviewIterations: z.number().int().min(0).max(3).default(0),
  includeTrace: z.boolean().default(false),
  presentation: z.unknown().optional(),
  operations: z.array(z.unknown()).optional(),
  traceId: z.string().trim().min(1).optional(),
});

/**
 * Normalize legacy flags onto the new design-review loop knobs:
 * - `visionRevision: true` ⇒ ensure `designReviewIterations` is at least 1
 *   (preserves the old "revise after vision review" behavior).
 */
export const DeckForgeRequestSchema = baseSchema.transform((req) => {
  const designReviewIterations =
    req.visionRevision && req.designReviewIterations === 0
      ? 1
      : req.designReviewIterations;
  return { ...req, designReviewIterations };
});

export type DeckForgeRequest = z.infer<typeof DeckForgeRequestSchema>;

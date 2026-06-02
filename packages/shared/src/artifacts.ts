import { z } from 'zod';

export const artifactKindSchema = z.enum([
  'pptx',
  'pdf',
  'html',
  'png',
  'jpg',
  'json',
  'text',
  'source-js',
  'contact-sheet',
  'rendered-slide',
  'render-dir',
  'work-dir',
  'diagnostics-json',
  'image-asset',
  'deck-compose',
  'deck-defs',
  'deck-preview',
  'other',
]);

export type ArtifactKind = z.infer<typeof artifactKindSchema>;

// --- Deck Live Preview ---

export const deckSpecUrlsSchema = z.object({
  briefUrl: z.string().url().nullable(),
  outlineUrl: z.string().url().nullable(),
  artDirectionUrl: z.string().url().nullable(),
});

export type DeckSpecUrls = z.infer<typeof deckSpecUrlsSchema>;

export const deckSlidePreviewSchema = z.object({
  slug: z.string().min(1),
  previewUrl: z.string().url().nullable(),
  composeUrl: z.string().url().nullable(),
});

export type DeckSlidePreview = z.infer<typeof deckSlidePreviewSchema>;

export const deckResultSchema = z.object({
  deckId: z.string().min(1),
  name: z.string(),
  language: z.enum(['ja', 'en']),
  slideOrder: z.array(z.string()),
  defsUrl: z.string().url().nullable(),
  pptxDownloadUrl: z.string().url().nullable(),
  specs: deckSpecUrlsSchema,
  slides: z.array(deckSlidePreviewSchema),
  version: z.literal(1),
});

export type DeckResult = z.infer<typeof deckResultSchema>;

export const artifactRefSchema = z.object({
  id: z.string().min(1),
  kind: artifactKindSchema,
  name: z.string().min(1),
  path: z.string().optional(),
  url: z.string().url().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  label: z.string().optional(),
  exists: z.boolean().optional(),
});

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const artifactManifestSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  artifacts: z.array(artifactRefSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Structured Live Preview view of the deck, when this run produced slides. */
  deck: deckResultSchema.optional(),
});

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const uploadedArtifactSchema = z.object({
  kind: artifactKindSchema,
  label: z.string(),
  localPath: z.string(),
  bucket: z.string(),
  key: z.string(),
  s3Uri: z.string(),
  downloadUrl: z.string().url().optional(),
  uploaded: z.boolean(),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
});

export type UploadedArtifact = z.infer<typeof uploadedArtifactSchema>;

export const artifactUploadResultSchema = z.object({
  uploadedArtifacts: z.array(uploadedArtifactSchema),
  warnings: z.array(z.string()),
});

export type ArtifactUploadResult = z.infer<typeof artifactUploadResultSchema>;

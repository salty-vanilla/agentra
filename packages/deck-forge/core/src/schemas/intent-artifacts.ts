import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const IdSchema = z.string();

export const ExportFormatSchema = z.enum([
  "pptx",
  "html",
  "pdf",
  "json",
  "google_slides",
]);

// ---------------------------------------------------------------------------
// Visual direction (referenced by Brief and AssetSpec)
// ---------------------------------------------------------------------------

export const VisualDirectionSchema = z
  .object({
    style: z.enum([
      "minimal",
      "corporate",
      "technical",
      "industrial",
      "isometric",
      "flat_vector",
      "photorealistic",
      "abstract",
      "diagrammatic",
    ]),
    mood: z.enum([
      "calm",
      "trustworthy",
      "futuristic",
      "energetic",
      "premium",
      "practical",
    ]),
    colorMood: z.string().optional(),
    composition: z.string().optional(),
    avoid: z.array(z.string()).optional(),
  })
  .meta({ title: "VisualDirectionSpec" });

// ---------------------------------------------------------------------------
// Brand color/typography (subset reused by BrandSpec)
// ---------------------------------------------------------------------------

const ColorTokensPartialSchema = z
  .object({
    background: z.string(),
    surface: z.string(),
    textPrimary: z.string(),
    textSecondary: z.string(),
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    success: z.string().optional(),
    warning: z.string().optional(),
    danger: z.string().optional(),
    chartPalette: z.array(z.string()),
  })
  .partial();

const FontFamilyPartialSchema = z
  .object({
    heading: z.string(),
    body: z.string(),
    mono: z.string().optional(),
  })
  .partial();

// ---------------------------------------------------------------------------
// Brief sub-shapes
// ---------------------------------------------------------------------------

export const AudienceSchema = z
  .object({
    primary: z.string(),
    secondary: z.array(z.string()).optional(),
    expertiseLevel: z.enum(["beginner", "intermediate", "expert", "executive"]),
    expectedConcern: z.array(z.string()).optional(),
    expectedQuestions: z.array(z.string()).optional(),
  })
  .meta({ title: "AudienceSpec" });

export const GoalSchema = z
  .object({
    type: z.enum([
      "inform",
      "persuade",
      "proposal",
      "report",
      "training",
      "sales",
      "research",
      "decision_support",
    ]),
    mainMessage: z.string(),
    desiredOutcome: z.string(),
    successCriteria: z.array(z.string()).optional(),
  })
  .meta({ title: "GoalSpec" });

export const ToneSchema = z
  .object({
    formality: z.enum(["casual", "business", "executive", "academic"]),
    energy: z.enum(["calm", "confident", "bold", "inspiring"]),
    technicalDepth: z.enum(["low", "medium", "high"]),
    styleKeywords: z.array(z.string()).optional(),
  })
  .meta({ title: "ToneSpec" });

export const NarrativeStepSchema = z
  .object({
    role: z.enum([
      "hook",
      "problem",
      "insight",
      "solution",
      "evidence",
      "implementation",
      "impact",
      "call_to_action",
    ]),
    message: z.string(),
  })
  .meta({ title: "NarrativeStep" });

export const NarrativeSchema = z
  .object({
    structure: z.enum([
      "problem_solution",
      "before_after",
      "proposal",
      "analysis",
      "story",
      "pyramid",
      "research_paper",
      "demo",
    ]),
    arc: z.array(NarrativeStepSchema),
  })
  .meta({ title: "NarrativeSpec" });

export const OutputSchema = z
  .object({
    formats: z.array(ExportFormatSchema),
    aspectRatio: z.enum(["16:9", "4:3"]),
    language: z.string().optional(),
  })
  .meta({ title: "OutputSpec" });

export const PresentationConstraintsSchema = z
  .object({
    slideCount: z.number().int().optional(),
    maxSlideCount: z.number().int().optional(),
    minSlideCount: z.number().int().optional(),
    durationMinutes: z.number().optional(),
    mustInclude: z.array(z.string()).optional(),
    mustAvoid: z.array(z.string()).optional(),
  })
  .meta({ title: "PresentationConstraints" });

export const BrandSchema = z
  .object({
    name: z.string().optional(),
    voice: z.string().optional(),
    colors: ColorTokensPartialSchema.optional(),
    fonts: FontFamilyPartialSchema.optional(),
    logoAssetId: IdSchema.optional(),
  })
  .meta({ title: "BrandSpec" });

// ---------------------------------------------------------------------------
// PresentationBrief
// ---------------------------------------------------------------------------

export const BriefSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    audience: AudienceSchema,
    goal: GoalSchema,
    context: z.string().optional(),
    tone: ToneSchema,
    narrative: NarrativeSchema,
    output: OutputSchema,
    constraints: PresentationConstraintsSchema,
    visualDirection: VisualDirectionSchema,
    brand: BrandSchema.optional(),
  })
  .meta({
    id: "PresentationBrief",
    title: "PresentationBrief",
    description:
      "High-level intent spec created from a user request. Input to generateDeckPlan.",
  });

// ---------------------------------------------------------------------------
// Slide intent / layout (used by both DeckPlan and SlideSpec)
// ---------------------------------------------------------------------------

export const SlideIntentSchema = z
  .object({
    type: z.enum([
      "title",
      "agenda",
      "summary",
      "problem",
      "comparison",
      "timeline",
      "process",
      "architecture",
      "data_insight",
      "case_study",
      "proposal",
      "decision",
      "closing",
    ]),
    keyMessage: z.string(),
    audienceTakeaway: z.string(),
  })
  .meta({ title: "SlideIntent" });

export const LayoutTypeSchema = z.enum([
  "title",
  "section",
  "single_column",
  "two_column",
  "three_column",
  "hero",
  "image_left_text_right",
  "text_left_image_right",
  "comparison",
  "dashboard",
  "timeline",
  "matrix",
  "diagram_focus",
  "custom",
]);

export const LayoutRegionSchema = z
  .object({
    id: IdSchema,
    role: z.enum([
      "title",
      "body",
      "visual",
      "sidebar",
      "footer",
      "chart",
      "table",
      "callout",
    ]),
    contentRefs: z.array(IdSchema),
    priority: z.number(),
  })
  .meta({ title: "LayoutRegion" });

export const LayoutSchema = z
  .object({
    type: LayoutTypeSchema,
    density: z.enum(["low", "medium", "high"]),
    emphasis: z
      .enum(["top", "left", "right", "center", "visual", "data"])
      .optional(),
    regions: z.array(LayoutRegionSchema).optional(),
  })
  .meta({ title: "LayoutSpec" });

// ---------------------------------------------------------------------------
// ContentBlock variants
// ---------------------------------------------------------------------------

const TitleBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("title"),
  text: z.string(),
  emphasis: z.enum(["normal", "strong", "subtle"]).optional(),
});

const SubtitleBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("subtitle"),
  text: z.string(),
});

const ParagraphBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("paragraph"),
  text: z.string(),
});

export type BulletItem = {
  text: string;
  children?: BulletItem[];
  importance?: "low" | "medium" | "high";
};

export const BulletItemSchema: z.ZodType<BulletItem> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(BulletItemSchema).optional(),
    importance: z.enum(["low", "medium", "high"]).optional(),
  }),
);

const BulletListBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("bullet_list"),
  items: z.array(BulletItemSchema),
  hierarchy: z.enum(["flat", "nested"]).optional(),
  density: z.enum(["low", "medium", "high"]).optional(),
});

const TableEmphasisSchema = z.object({
  rows: z.array(z.number().int()).optional(),
  columns: z.array(z.number().int()).optional(),
  cells: z
    .array(z.object({ row: z.number().int(), column: z.number().int() }))
    .optional(),
});

const TableBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("table"),
  caption: z.string().optional(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  emphasis: TableEmphasisSchema.optional(),
});

const ChartSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
});

const ChartDataSchema = z.object({
  series: z.array(ChartSeriesSchema),
  categories: z.array(z.string()).optional(),
});

const ChartEncodingSchema = z.object({
  x: z.string().optional(),
  y: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
});

const ChartTypeSchema = z.enum([
  "bar",
  "line",
  "area",
  "pie",
  "scatter",
  "combo",
]);

const ChartBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("chart"),
  chartType: ChartTypeSchema,
  title: z.string().optional(),
  data: ChartDataSchema,
  encoding: ChartEncodingSchema,
  insight: z.string().optional(),
});

const DiagramTypeSchema = z.enum([
  "flowchart",
  "architecture",
  "timeline",
  "layered",
  "cycle",
  "matrix",
  "funnel",
  "system_map",
]);

const DiagramNodeSchema = z.object({
  id: IdSchema,
  label: z.string(),
  description: z.string().optional(),
  kind: z.string().optional(),
});

const DiagramEdgeSchema = z.object({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  label: z.string().optional(),
});

const DiagramBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("diagram"),
  diagramType: DiagramTypeSchema,
  nodes: z.array(DiagramNodeSchema),
  edges: z.array(DiagramEdgeSchema).optional(),
});

const ImageBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("image"),
  assetId: IdSchema,
  altText: z.string().optional(),
  caption: z.string().optional(),
});

const MetricBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("metric"),
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});

const CalloutBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("callout"),
  text: z.string(),
  tone: z.enum(["info", "success", "warning", "danger"]).optional(),
});

const CodeBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("code"),
  code: z.string(),
  language: z.string().optional(),
});

const QuoteBlockSchema = z.object({
  id: IdSchema,
  type: z.literal("quote"),
  text: z.string(),
  attribution: z.string().optional(),
});

export const ContentBlockSchema = z
  .discriminatedUnion("type", [
    TitleBlockSchema,
    SubtitleBlockSchema,
    ParagraphBlockSchema,
    BulletListBlockSchema,
    TableBlockSchema,
    ChartBlockSchema,
    DiagramBlockSchema,
    ImageBlockSchema,
    MetricBlockSchema,
    CalloutBlockSchema,
    CodeBlockSchema,
    QuoteBlockSchema,
  ])
  .meta({
    id: "ContentBlock",
    title: "ContentBlock",
    description: "Slide content block. Discriminated by `type`.",
  });

// ---------------------------------------------------------------------------
// SlideSpec
// ---------------------------------------------------------------------------

const SpeakerNotesSchema = z.object({
  text: z.string(),
  cues: z.array(z.string()).optional(),
});

const AssetSpecRefSchema = z.object({
  assetId: IdSchema,
  role: z.enum(["background", "hero", "inline", "icon", "diagram"]),
});

const SlideConstraintsSchema = z.object({
  maxWords: z.number().int().optional(),
  maxBullets: z.number().int().optional(),
  requiredElementIds: z.array(IdSchema).optional(),
});

export const SlideSpecSchema = z
  .object({
    id: IdSchema,
    slideNumber: z.number().int().min(1).optional(),
    title: z.string(),
    intent: SlideIntentSchema,
    layout: LayoutSchema,
    content: z.array(ContentBlockSchema),
    speakerNotes: SpeakerNotesSchema.optional(),
    assets: z.array(AssetSpecRefSchema).optional(),
    constraints: SlideConstraintsSchema.optional(),
  })
  .meta({
    id: "SlideSpec",
    title: "SlideSpec",
    description:
      "Detailed specification for a single slide. Input to buildPresentationIr.",
  });

// ---------------------------------------------------------------------------
// DeckPlan
// ---------------------------------------------------------------------------

const ContentRequirementSchema = z.object({
  id: IdSchema,
  description: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  expectedBlockType: z
    .enum([
      "title",
      "subtitle",
      "paragraph",
      "bullet_list",
      "table",
      "chart",
      "diagram",
      "image",
      "metric",
      "callout",
      "code",
      "quote",
    ])
    .optional(),
});

const AssetPurposeSchema = z.enum([
  "hero",
  "background",
  "concept",
  "illustration",
  "thumbnail",
  "supporting_visual",
  "diagram",
  "icon",
  "screenshot",
]);

const AssetRequirementSchema = z.object({
  id: IdSchema,
  purpose: AssetPurposeSchema,
  description: z.string(),
  acquisitionMode: z.enum(["generate", "retrieve", "auto"]).optional(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const SlidePlanSchema = z.object({
  id: IdSchema,
  title: z.string(),
  intent: SlideIntentSchema,
  expectedLayout: LayoutTypeSchema,
  contentRequirements: z.array(ContentRequirementSchema),
  assetRequirements: z.array(AssetRequirementSchema).optional(),
});

const DeckSectionSchema = z.object({
  id: IdSchema,
  title: z.string(),
  role: z.enum([
    "intro",
    "background",
    "problem",
    "proposal",
    "analysis",
    "solution",
    "implementation",
    "result",
    "appendix",
  ]),
  slides: z.array(SlidePlanSchema),
});

export const DeckPlanSchema = z
  .object({
    id: IdSchema,
    briefId: IdSchema,
    title: z.string(),
    slideCountTarget: z.number().int(),
    sections: z.array(DeckSectionSchema),
    globalStoryline: z.string(),
  })
  .meta({
    id: "DeckPlan",
    title: "DeckPlan",
    description:
      "Section-and-slide outline derived from a PresentationBrief. Input to generateSlideSpecs.",
  });

// ---------------------------------------------------------------------------
// AssetSpec variants
// ---------------------------------------------------------------------------

const GeneratedImageAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("generated_image"),
  purpose: z.enum([
    "hero",
    "background",
    "concept",
    "illustration",
    "thumbnail",
    "supporting_visual",
  ]),
  visualDirection: VisualDirectionSchema,
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  aspectRatio: z.enum(["16:9", "4:3", "1:1", "3:2"]),
  resolution: z
    .object({ width: z.number().int(), height: z.number().int() })
    .optional(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const DiagramAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("diagram"),
  diagramType: DiagramTypeSchema,
  description: z.string(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const IconAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("icon"),
  name: z.string(),
  style: VisualDirectionSchema.shape.style.optional(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const ExternalImageAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("external_image"),
  uri: z.string(),
  altText: z.string().optional(),
  provider: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  sourcePageUrl: z.string().optional(),
  attributionRequired: z.boolean().optional(),
  attributionText: z.string().optional(),
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const ImageSearchCandidateSchema = z.object({
  id: z.string(),
  provider: z.string(),
  title: z.string().optional(),
  imageUrl: z.string(),
  sourcePageUrl: z.string(),
  author: z.string().optional(),
  license: z.string(),
  attributionRequired: z.boolean(),
  attributionText: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const RetrievedImageAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("retrieved_image"),
  provider: z.enum([
    "unsplash",
    "pexels",
    "pixabay",
    "flaticon",
    "noun_project",
    "icons8",
    "undraw",
    "storyset",
    "shigureni",
    "irasutoya",
    "other",
  ]),
  query: z.string(),
  selected: ImageSearchCandidateSchema.optional(),
  licenseConstraints: z.array(z.string()).optional(),
  targetSlideIds: z.array(IdSchema).optional(),
});

const ScreenshotAssetSpecSchema = z.object({
  id: IdSchema,
  type: z.literal("screenshot"),
  sourceUrl: z.string().optional(),
  description: z.string(),
  targetSlideIds: z.array(IdSchema).optional(),
});

export const AssetSpecSchema = z
  .discriminatedUnion("type", [
    GeneratedImageAssetSpecSchema,
    DiagramAssetSpecSchema,
    IconAssetSpecSchema,
    ExternalImageAssetSpecSchema,
    RetrievedImageAssetSpecSchema,
    ScreenshotAssetSpecSchema,
  ])
  .meta({
    id: "AssetSpec",
    title: "AssetSpec",
    description: "Asset acquisition spec. Discriminated by `type`.",
  });

// ---------------------------------------------------------------------------
// Inferred types — public surface (re-exported from @deck-forge/core/index.ts)
// ---------------------------------------------------------------------------

export type PresentationBrief = z.infer<typeof BriefSchema>;
export type AudienceSpec = z.infer<typeof AudienceSchema>;
export type GoalSpec = z.infer<typeof GoalSchema>;
export type ToneSpec = z.infer<typeof ToneSchema>;
export type NarrativeSpec = z.infer<typeof NarrativeSchema>;
export type NarrativeStep = z.infer<typeof NarrativeStepSchema>;
export type OutputSpec = z.infer<typeof OutputSchema>;
export type PresentationConstraints = z.infer<
  typeof PresentationConstraintsSchema
>;
export type BrandSpec = z.infer<typeof BrandSchema>;
export type VisualDirectionSpec = z.infer<typeof VisualDirectionSchema>;

export type DeckPlan = z.infer<typeof DeckPlanSchema>;
export type DeckSection = z.infer<typeof DeckSectionSchema>;
export type SlidePlan = z.infer<typeof SlidePlanSchema>;
export type SlideIntent = z.infer<typeof SlideIntentSchema>;
export type LayoutIntent = z.infer<typeof LayoutTypeSchema>;
export type ContentRequirement = z.infer<typeof ContentRequirementSchema>;
export type AssetRequirement = z.infer<typeof AssetRequirementSchema>;

export type SlideSpec = z.infer<typeof SlideSpecSchema>;
export type SpeakerNotesSpec = z.infer<typeof SpeakerNotesSchema>;
export type AssetSpecRef = z.infer<typeof AssetSpecRefSchema>;
export type SlideConstraints = z.infer<typeof SlideConstraintsSchema>;
export type LayoutSpec = z.infer<typeof LayoutSchema>;
export type LayoutRegion = z.infer<typeof LayoutRegionSchema>;

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type TitleBlock = z.infer<typeof TitleBlockSchema>;
export type SubtitleBlock = z.infer<typeof SubtitleBlockSchema>;
export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;
export type BulletListBlock = z.infer<typeof BulletListBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type TableEmphasis = z.infer<typeof TableEmphasisSchema>;
export type ChartBlock = z.infer<typeof ChartBlockSchema>;
export type ChartData = z.infer<typeof ChartDataSchema>;
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;
export type ChartEncoding = z.infer<typeof ChartEncodingSchema>;
export type DiagramBlock = z.infer<typeof DiagramBlockSchema>;
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type MetricBlock = z.infer<typeof MetricBlockSchema>;
export type CalloutBlock = z.infer<typeof CalloutBlockSchema>;
export type CodeBlock = z.infer<typeof CodeBlockSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;

export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type GeneratedImageAssetSpec = z.infer<
  typeof GeneratedImageAssetSpecSchema
>;
export type DiagramAssetSpec = z.infer<typeof DiagramAssetSpecSchema>;
export type IconAssetSpec = z.infer<typeof IconAssetSpecSchema>;
export type ExternalImageAssetSpec = z.infer<typeof ExternalImageAssetSpecSchema>;
export type RetrievedImageAssetSpec = z.infer<
  typeof RetrievedImageAssetSpecSchema
>;
export type ScreenshotAssetSpec = z.infer<typeof ScreenshotAssetSpecSchema>;
export type ImageSearchCandidate = z.infer<typeof ImageSearchCandidateSchema>;

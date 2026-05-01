export { JsonExporter } from "#src/exporters/json/json-exporter.js";
export { HtmlExporter } from "#src/exporters/html/html-exporter.js";
export { PdfExporter } from "#src/exporters/pdf/pdf-exporter.js";
export { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
export { inspectPresentation } from "#src/inspect/inspect-presentation.js";
export { resolveAnchor } from "#src/inspect/resolve-anchor.js";
export type { InspectQuery, InspectResult, ResolvedAnchor } from "#src/inspect/types.js";
export { buildReviewPacket } from "#src/review/build-review-packet.js";
export { HtmlSlideImageRenderer } from "#src/review/html-slide-image-renderer.js";
export { PptxSlideImageRenderer } from "#src/review/pptx-slide-image-renderer.js";
export type { PptxSlideImageRendererOptions } from "#src/review/pptx-slide-image-renderer.js";
export type {
  BuildReviewPacketOptions,
  PresentationReviewPacket,
  SlideImage,
  SlideImageExportResult,
  SlideImageRenderInput,
  SlideImageRenderer,
  VisualReviewer,
  VisualReviewerInput,
  VisualReviewerOutput,
  VisualReviewFinding,
  VisualReviewFocus,
  VisualReviewSeverity,
} from "#src/review/types.js";
export { applyOperations } from "#src/operations/apply-operations.js";
export {
  isDecorativeElement,
  reflowElementsIntoLayoutRegions,
} from "#src/operations/utils.js";
export type { ReflowOptions } from "#src/operations/utils.js";
export {
  clampFrameToSlide,
  findDuplicateFrameGroups,
  frameOverlapRatio,
  framesEqual,
  isFrameOutOfBounds,
  stackFramesVertically,
} from "#src/geometry/frame-geometry.js";
export type { FrameLike } from "#src/geometry/frame-geometry.js";
export type {
  AddChartOperation,
  AddImageOperation,
  AddSlideOperation,
  AddTableOperation,
  AddTextOperation,
  ApplyThemeOperation,
  AttachAssetOperation,
  DeleteElementOperation,
  MoveElementOperation,
  MoveSlideOperation,
  PresentationOperation,
  RemoveSlideOperation,
  ResizeElementOperation,
  SetElementFrameOperation,
  SetElementRegionOperation,
  SetSlideLayoutOperation,
  UpdateChartDataOperation,
  UpdateElementStyleOperation,
  UpdateTextOperation,
} from "#src/operations/types.js";
export {
  deserializePresentation,
  loadPresentationFromFile,
  savePresentationToFile,
  serializePresentation,
} from "#src/json.js";
export { validatePresentation } from "#src/validation/validate-presentation.js";
export { autoFixPresentation } from "#src/validation/autofix/auto-fix-presentation.js";
export { NoopImageGenerator } from "#src/assets/generators/noop-image-generator.js";
export {
  BedrockImageGenerator,
  LocalFileImageGenerator,
  OpenAiImageGenerator,
  generateImageFromAssetSpec,
  retrieveImageFromAssetSpec,
  searchImageCandidates,
  materializeGeneratedAssets,
} from "#src/assets/image-runtime.js";
export type {
  GenerateImageFromAssetSpecOptions,
  MaterializeGeneratedAssetsOptions,
  RetrieveImageAssetOptions,
  SearchImageCandidatesOptions,
} from "#src/assets/image-runtime.js";
export type { ValidateLevel, ValidateOptions, ValidateResult } from "#src/validation/types.js";
export {
  LocalPresentationRuntime,
  createLocalRuntime,
} from "#src/runtime/local-presentation-runtime.js";
export {
  PATH_OUTSIDE_WORKSPACE,
  assertPathAllowed,
  resolveSafetyOptions,
} from "#src/runtime/path-policy.js";
export {
  createPresentationSpec,
  generateAssetPlan,
  generateDeckPlan,
  generateSlideSpecs,
} from "#src/spec-generation/generate-spec-artifacts.js";
export { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
export {
  listComponents,
  preflightComponents,
  synthesizeComponents,
} from "#src/components/component-catalog.js";
export type {
  BuildPresentationIrInput,
  BuildPresentationIrOutput,
} from "#src/builders/build-presentation-ir.js";
export type { ComponentCatalogOptions } from "#src/components/component-catalog.js";
export type {
  CreatePresentationSpecInput,
  CreatePresentationSpecOutput,
  GenerateAssetPlanInput,
  GenerateAssetPlanOutput,
  GenerateDeckPlanInput,
  GenerateDeckPlanOutput,
  GenerateSlideSpecsInput,
  GenerateSlideSpecsOutput,
} from "#src/spec-generation/types.js";
export type {
  CreatePresentationInput,
  LocalPresentationRuntimeOptions,
  PresentationRuntime,
  PresentationReviewPacketBuilder,
  PresentationValidator,
  RuntimeReviewPacketOptions,
} from "#src/runtime/types.js";
export type { RuntimeSafetyOptions } from "#src/runtime/path-policy.js";
export type {
  DesignFocus,
  SlideDesigner,
  SlideDesignerInput,
  SlideDesignerOutput,
} from "#src/design/types.js";
export { HeuristicSlideDesigner } from "#src/design/heuristic-slide-designer.js";
export { runDesignReviewLoop } from "#src/runtime/design-review-loop.js";
export type {
  DesignReviewIterationTrace,
  DesignReviewLoopInput,
  DesignReviewLoopOutput,
} from "#src/runtime/design-review-loop.js";

// Artifact types and Zod schemas — single source of truth in `schemas/`.
import type {
  AssetRequirement,
  AssetSpec,
  AssetSpecRef,
  AudienceSpec,
  BrandSpec,
  BulletItem,
  BulletListBlock,
  CalloutBlock,
  ChartBlock,
  ChartData,
  ChartEncoding,
  ChartSeries,
  CodeBlock,
  ContentBlock,
  ContentRequirement,
  DeckPlan,
  DeckSection,
  DiagramAssetSpec,
  DiagramBlock,
  DiagramEdge,
  DiagramNode,
  ExternalImageAssetSpec,
  GeneratedImageAssetSpec,
  GoalSpec,
  IconAssetSpec,
  ImageBlock,
  ImageSearchCandidate,
  LayoutIntent,
  LayoutRegion,
  LayoutSpec,
  MetricBlock,
  NarrativeSpec,
  NarrativeStep,
  OutputSpec,
  ParagraphBlock,
  PresentationBrief,
  PresentationConstraints,
  QuoteBlock,
  RetrievedImageAssetSpec,
  ScreenshotAssetSpec,
  SlideConstraints,
  SlideIntent,
  SlidePlan,
  SlideSpec,
  SpeakerNotesSpec,
  SubtitleBlock,
  TableBlock,
  TableEmphasis,
  TitleBlock,
  ToneSpec,
  VisualDirectionSpec,
} from "#src/schemas/intent-artifacts.js";
export {
  AssetSpecSchema,
  AudienceSchema,
  BrandSchema,
  BriefSchema,
  BulletItemSchema,
  ContentBlockSchema,
  DeckPlanSchema,
  ExportFormatSchema,
  GoalSchema,
  IdSchema,
  LayoutRegionSchema,
  LayoutSchema,
  LayoutTypeSchema,
  NarrativeSchema,
  NarrativeStepSchema,
  OutputSchema,
  PresentationConstraintsSchema,
  SlideIntentSchema,
  SlideSpecSchema,
  ToneSchema,
  VisualDirectionSchema,
} from "#src/schemas/intent-artifacts.js";
export type {
  AssetRequirement,
  AssetSpec,
  AssetSpecRef,
  AudienceSpec,
  BrandSpec,
  BulletItem,
  BulletListBlock,
  CalloutBlock,
  ChartBlock,
  ChartData,
  ChartEncoding,
  ChartSeries,
  CodeBlock,
  ContentBlock,
  ContentRequirement,
  DeckPlan,
  DeckSection,
  DiagramAssetSpec,
  DiagramBlock,
  DiagramEdge,
  DiagramNode,
  ExternalImageAssetSpec,
  GeneratedImageAssetSpec,
  GoalSpec,
  IconAssetSpec,
  ImageBlock,
  ImageSearchCandidate,
  LayoutIntent,
  LayoutRegion,
  LayoutSpec,
  MetricBlock,
  NarrativeSpec,
  NarrativeStep,
  OutputSpec,
  ParagraphBlock,
  PresentationBrief,
  PresentationConstraints,
  QuoteBlock,
  RetrievedImageAssetSpec,
  ScreenshotAssetSpec,
  SlideConstraints,
  SlideIntent,
  SlidePlan,
  SlideSpec,
  SpeakerNotesSpec,
  SubtitleBlock,
  TableBlock,
  TableEmphasis,
  TitleBlock,
  ToneSpec,
  VisualDirectionSpec,
} from "#src/schemas/intent-artifacts.js";

export type Id = string;
export type ISODateTime = string;

export type ResolvedLayout = {
  spec: LayoutSpec;
  slideSize: SlideSize;
  regions: ResolvedRegion[];
};

export type SlideSize = {
  width: number;
  height: number;
  unit: "px" | "pt" | "in";
};

export type ResolvedRegion = LayoutRegion & {
  frame: ResolvedFrame;
};

export type ResolvedFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type ThemeSpec = {
  id: Id;
  name: string;
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows?: ShadowTokens;
  slideDefaults: SlideStyleDefaults;
  elementDefaults: ElementStyleDefaults;
};

export type ColorTokens = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  secondary: string;
  accent: string;
  success?: string;
  warning?: string;
  danger?: string;
  chartPalette: string[];
};

export type TypographyTokens = {
  fontFamily: {
    heading: string;
    body: string;
    mono?: string;
  };
  fontSize: {
    title: number;
    heading: number;
    body: number;
    caption: number;
    footnote: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
  weight: {
    regular: number;
    medium: number;
    bold: number;
  };
};

export type SpacingTokens = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type RadiusTokens = {
  none: number;
  sm: number;
  md: number;
  lg: number;
  full: number;
};

export type ShadowTokens = {
  sm?: string;
  md?: string;
  lg?: string;
};

export type SlideStyleDefaults = {
  backgroundColor?: string;
  padding?: number;
};

export type ElementStyleDefaults = {
  text?: Partial<TextStyle>;
  shape?: Partial<ShapeStyle>;
};

export type ComponentSpec = {
  id: Id;
  version: string;
  capability: string;
  propsSchema: Record<string, unknown>;
  slotSchema: string[];
  layoutContract: {
    variant: string;
    regionRoles: string[];
  };
};

export type ComponentCatalog = {
  version: string;
  components: ComponentSpec[];
};

export type ComponentPreflightResult = {
  catalog: ComponentCatalog;
  matches: Array<{ slideId: Id; componentId: Id }>;
  missing: Array<{
    slideId: Id;
    requiredCapability: string;
    suggestedComponentId: string;
  }>;
};

export type AssetRegistry = {
  assets: Asset[];
};

export type Asset = {
  id: Id;
  specId?: Id;
  type: "image" | "diagram" | "icon" | "chart" | "other";
  uri: string;
  mimeType: string;
  metadata: AssetMetadata;
  usage: AssetUsage[];
};

export type AssetMetadata = {
  width?: number;
  height?: number;
  source: "generated" | "uploaded" | "external" | "derived";
  generator?: string;
  prompt?: string;
  provider?: string;
  author?: string;
  license?: string;
  sourcePageUrl?: string;
  attributionRequired?: boolean;
  attributionText?: string;
  createdAt: ISODateTime;
};

export type AssetUsage = {
  slideId: Id;
  elementId: Id;
  role: "background" | "hero" | "inline" | "icon" | "diagram";
};

export type ImageGenerationRequest = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:2";
  visualDirection?: VisualDirectionSpec;
  outputDir?: string;
  provider?: "openai" | "bedrock" | "local-file";
  model?: string;
  timeoutMs?: number;
  retries?: number;
};

export type GeneratedAsset = Asset;

export interface ImageGenerator {
  name: string;
  generate(input: ImageGenerationRequest): Promise<GeneratedAsset>;
}

export interface ImageRetriever {
  name: string;
  search(input: { query: string; limit?: number }): Promise<ImageSearchCandidate[]>;
  download(input: { candidate: ImageSearchCandidate; outputDir?: string }): Promise<Asset>;
}

export type PresentationIR = {
  id: Id;
  version: string;
  meta: PresentationMeta;
  brief?: PresentationBrief;
  deckPlan?: DeckPlan;
  theme: ThemeSpec;
  slides: SlideIR[];
  assets: AssetRegistry;
  operationLog: OperationRecord[];
  validation?: ValidationReport;
};

export type PresentationMeta = {
  title: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  author?: string;
  source?: string;
};

export type SlideIR = {
  id: Id;
  index: number;
  specId?: Id;
  title?: string;
  intent?: SlideIntent;
  layout: ResolvedLayout;
  elements: ElementIR[];
  speakerNotes?: string;
  comments?: CommentThread[];
  metadata?: Record<string, unknown>;
};

export type CommentThread = {
  id: Id;
  target?: string;
  comments: Comment[];
};

export type Comment = {
  id: Id;
  author: string;
  body: string;
  createdAt: ISODateTime;
};

export type ElementIR =
  | TextElementIR
  | ShapeElementIR
  | ImageElementIR
  | TableElementIR
  | ChartElementIR
  | DiagramElementIR;

export type TextElementIR = {
  id: Id;
  type: "text";
  role: "title" | "subtitle" | "body" | "caption" | "callout" | "footer";
  text: RichText;
  frame: ResolvedFrame;
  style: TextStyle;
  /**
   * Optional visual decoration hint propagated from a `LayoutStrategy`.
   * Exporters render matching styling (card, accent bar, divider) when
   * supported and silently ignore unknown values.
   */
  decoration?: ElementDecoration;
};

export type ElementDecoration = {
  kind: "card" | "accent-bar" | "divider";
  /** Optional override for the accent color used by the decoration. */
  color?: string;
};

export type ShapeElementIR = {
  id: Id;
  type: "shape";
  shapeType: "rect" | "round_rect" | "ellipse" | "line" | "arrow";
  frame: ResolvedFrame;
  style: ShapeStyle;
};

export type ImageElementIR = {
  id: Id;
  type: "image";
  assetId: Id;
  role?: "background" | "hero" | "inline" | "icon";
  frame: ResolvedFrame;
  crop?: ImageCrop;
};

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TableElementIR = {
  id: Id;
  type: "table";
  frame: ResolvedFrame;
  headers: string[];
  rows: string[][];
  style?: TableStyle;
};

export type ChartElementIR = {
  id: Id;
  type: "chart";
  frame: ResolvedFrame;
  chartType: ChartBlock["chartType"];
  data: ChartData;
  encoding: ChartEncoding;
  style?: ChartStyle;
};

export type DiagramElementIR = {
  id: Id;
  type: "diagram";
  frame: ResolvedFrame;
  diagramType: DiagramBlock["diagramType"];
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
  style?: DiagramStyle;
};

export type RichText = {
  paragraphs: RichParagraph[];
};

export type RichParagraph = {
  runs: RichTextRun[];
  alignment?: "left" | "center" | "right";
  spacingBefore?: number;
  spacingAfter?: number;
  bullet?: { indentLevel?: number };
};

export type RichTextRun = {
  text: string;
  style?: TextStyle;
  link?: {
    url: string;
  };
};

export type TextStyle = {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  lineHeight?: number;
};

export type ShapeStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
};

export type TableStyle = {
  headerFill?: string;
  borderColor?: string;
  textStyle?: TextStyle;
};

export type ChartStyle = {
  palette?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
};

export type DiagramStyle = {
  nodeFill?: string;
  edgeColor?: string;
  textStyle?: TextStyle;
};

export type OperationRecord = {
  id: Id;
  timestamp: ISODateTime;
  actor: "user" | "agent" | "system";
  operation: unknown;
  beforeHash?: string;
  afterHash?: string;
  result: "success" | "failed" | "skipped";
  error?: string;
};

export type ValidationReport = {
  status: "passed" | "warning" | "failed";
  issues: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
};

export type ValidationIssue = {
  id: Id;
  severity: "error" | "warning" | "info";
  category: "structural" | "layout" | "style" | "content" | "asset" | "export";
  message: string;
  target?: string;
  autoFixable?: boolean;
  suggestedFix?: AutoFixAction;
};

export type AutoFixAction = {
  type:
    | "move_element"
    | "resize_element"
    | "reduce_font_size"
    | "split_slide"
    | "shorten_text"
    | "apply_theme_token"
    | "crop_image";
  target: string;
  params: Record<string, unknown>;
};

export interface Exporter {
  format: ExportFormat;
  export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult>;
}

export type ExportFormat = "pptx" | "html" | "pdf" | "json" | "google_slides";

export type ExportOptions = {
  format: ExportFormat;
  outputPath?: string;
  includeSpeakerNotes?: boolean;
  metadata?: Record<string, unknown>;
};

export type ExportResult = {
  format: ExportFormat;
  path?: string;
  uri?: string;
  data?: Uint8Array | string;
  warnings?: string[];
};

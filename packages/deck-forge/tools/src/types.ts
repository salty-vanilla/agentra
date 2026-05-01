import type {
  AddChartOperation,
  Asset,
  AssetSpec,
  ComponentCatalog,
  ComponentPreflightResult,
  ComponentSpec,
  CreatePresentationSpecInput,
  DeckPlan,
  DesignFocus,
  ExportResult,
  ExternalImageAssetSpec,
  GeneratedImageAssetSpec,
  ImageSearchCandidate,
  InspectQuery,
  InspectResult,
  PresentationBrief,
  PresentationIR,
  PresentationOperation,
  PresentationReviewPacket,
  RetrievedImageAssetSpec,
  SlideDesigner,
  SlideImage,
  SlideImageRenderer,
  SlideSpec,
  ThemeSpec,
  ValidationReport,
  VisualReviewFinding,
  VisualReviewFocus,
  VisualReviewer,
} from "@deck-forge/core";

export type ApplyPresentationOperationsInput = {
  presentation: PresentationIR;
  operations: PresentationOperation[];
};

export type ApplyPresentationOperationsOutput = {
  presentation: PresentationIR;
};

export type AddChartInput = {
  presentation: PresentationIR;
  operation: AddChartOperation;
};

export type AddChartOutput = {
  presentation: PresentationIR;
};

export type UpdateChartDataInput = {
  presentation: PresentationIR;
  operation: {
    type: "update_chart_data";
    slideId: string;
    elementId: string;
    data: AddChartOperation["data"];
    encoding?: AddChartOperation["encoding"];
    chartType?: AddChartOperation["chartType"];
  };
};

export type UpdateChartDataOutput = {
  presentation: PresentationIR;
};

export type ListComponentsInput = {
  componentsDir?: string;
};

export type ListComponentsOutput = {
  catalog: ComponentCatalog;
};

export type ComponentPreflightInput = {
  slideSpecs: SlideSpec[];
  componentsDir?: string;
};

export type ComponentPreflightOutput = {
  result: ComponentPreflightResult;
};

export type ComponentSynthesizeInput = {
  slideSpecs: SlideSpec[];
  componentsDir?: string;
};

export type ComponentSynthesizeOutput = {
  created: ComponentSpec[];
  catalog: ComponentCatalog;
};

export type InspectPresentationInput = {
  presentation: PresentationIR;
  query: InspectQuery;
};

export type InspectPresentationOutput = {
  result: InspectResult;
};

export type ValidatePresentationInput = {
  presentation: PresentationIR;
  level?: "basic" | "strict" | "export";
};

export type ValidatePresentationOutput = {
  report: ValidationReport;
};

export type ExportPresentationInput = {
  presentation: PresentationIR;
  format: "pptx" | "html" | "json" | "pdf";
  outputPath?: string;
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
};

export type ExportPresentationOutput = {
  result: ExportResult;
};

export type BuildReviewPacketInput = {
  userRequest: string;
  presentation: PresentationIR;
  validationReport?: ValidationReport;
  grounding?: {
    language?: string;
    requestedSlideCount?: number;
    mustInclude?: string[];
    mustAvoid?: string[];
  };
  renderImages?: boolean;
  slideIds?: string[];
  imageFormat?: "png" | "jpeg";
  imageScale?: number;
  renderer?: SlideImageRenderer;
};

export type BuildReviewPacketOutput = {
  packet: Omit<PresentationReviewPacket, "slideImages"> & {
    slideImages?: Array<{
      slideId: string;
      mimeType: "image/png" | "image/jpeg";
      dataBase64: string;
      width?: number;
      height?: number;
      source?: "ir-html" | "pptx" | "external";
      renderer?: string;
    }>;
  };
};

export type ExportSlideImagesInput = {
  presentation: PresentationIR;
  format?: "png" | "jpeg";
  slideIds?: string[];
  scale?: number;
  outputDir?: string;
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
  renderer?: SlideImageRenderer;
};

export type ExportSlideImagesOutput = {
  images: Array<{
    slideId: string;
    mimeType: "image/png" | "image/jpeg";
    dataBase64?: string;
    path?: string;
    width?: number;
    height?: number;
    source?: "ir-html" | "pptx" | "external";
    renderer?: string;
  }>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type CreatePresentationSpecInputPayload = CreatePresentationSpecInput;

export type CreatePresentationSpecOutput = {
  brief: PresentationBrief;
};

export type GenerateDeckPlanInput = {
  brief: PresentationBrief;
};

export type GenerateDeckPlanOutput = {
  deckPlan: DeckPlan;
};

export type GenerateSlideSpecsInput = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
};

export type GenerateSlideSpecsOutput = {
  slideSpecs: SlideSpec[];
};

export type GenerateAssetPlanInput = {
  brief: PresentationBrief;
  slideSpecs: SlideSpec[];
  acquisitionMode?: "generate" | "retrieve" | "auto";
  imageProvider?: "pexels" | "unsplash" | "pixabay";
};

export type GenerateAssetPlanOutput = {
  assetSpecs: AssetSpec[];
};

export type BuildPresentationIrInput = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs: AssetSpec[];
  id?: string;
  version?: string;
  title?: string;
  theme?: ThemeSpec;
  meta?: Partial<PresentationIR["meta"]>;
};

export type BuildPresentationIrOutput = {
  presentation: PresentationIR;
};

export type GenerateImageInput = {
  assetSpec: GeneratedImageAssetSpec;
  presentation?: PresentationIR;
  outputDir?: string;
  preferredGenerator?: string;
  provider?: "openai" | "bedrock" | "local-file";
  model?: string;
  timeoutMs?: number;
  retries?: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  bedrockRegion?: string;
  bedrockModelId?: string;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
};

export type GenerateImageOutput = {
  asset: Asset;
  presentation?: PresentationIR;
};

export type SearchAssetsInput = {
  query: string;
  provider?: "unsplash" | "pexels" | "pixabay";
  limit?: number;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
};

export type SearchAssetsOutput = {
  candidates: ImageSearchCandidate[];
};

export type AttachRetrievedAssetInput = {
  presentation: PresentationIR;
  assetSpec: RetrievedImageAssetSpec | ExternalImageAssetSpec;
  outputDir?: string;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
};

export type AttachRetrievedAssetOutput = {
  asset: Asset;
  presentation: PresentationIR;
};

export type CreatePresentationArtifacts = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs?: AssetSpec[];
};

export type StructuredIntent = {
  mode: "create" | "modify";
  audience?: string;
  goal?: string;
  slideCount?: number;
  tone?: string;
  visualPreset?: "balanced" | "visual_heavy" | "data_heavy";
  createArtifacts?: CreatePresentationArtifacts;
  grounding?: {
    language?: string;
    requestedSlideCount?: number;
    mustInclude?: string[];
    mustAvoid?: string[];
  };
  constraints?: {
    mustInclude?: string[];
    mustAvoid?: string[];
  };
  modifyIntent?: {
    targetSlideId?: string;
    changeRequest: string;
    operations?: PresentationOperation[];
  };
  confidence: number;
  rationale?: string;
  missingFields?: string[];
};

export interface IntentParser {
  parseCreate(input: { userRequest: string }): Promise<StructuredIntent>;
  parseModify(input: {
    userRequest: string;
    inspectSummary?: Record<string, unknown>;
  }): Promise<StructuredIntent>;
}

export type ParseRequestInput = {
  mode: "create" | "modify";
  userRequest: string;
  inspectSummary?: Record<string, unknown>;
};

export type ParseRequestOutput = {
  intent: StructuredIntent;
};

export type ValidationResult = {
  valid: boolean;
  issues: string[];
};

export type ValidateAgentCreateArtifactsInput = {
  userRequest: string;
  intent: StructuredIntent;
};

export type ValidateAgentCreateArtifactsOutput = ValidationResult & {
  artifacts?: CreatePresentationArtifacts;
};

export type ReviewIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  slideId?: string;
  elementId?: string;
  suggestion?: string;
};

export type ReviewPresentationInput = {
  presentation: PresentationIR;
  report?: ValidationReport;
  goal?: string;
  packet?: PresentationReviewPacket;
  reviewer?: PresentationReviewer;
};

export type ReviewPresentationOutput = {
  issues: ReviewIssue[];
};

export interface PresentationReviewer {
  review(input: ReviewPresentationInput): Promise<ReviewIssue[]>;
}

export type PlanPresentationOperationsInput = {
  presentation: PresentationIR;
  issues: ReviewIssue[];
  goal?: string;
  operationPlanner?: PresentationOperationPlanner;
};

export type PlanPresentationOperationsOutput = {
  operations: PresentationOperation[];
};

export interface PresentationOperationPlanner {
  plan(input: PlanPresentationOperationsInput): Promise<PresentationOperation[]>;
}

// ---------------------------------------------------------------------------
// presentation_design_pass
// ---------------------------------------------------------------------------

export type DesignPassInput = {
  presentation: PresentationIR;
  /**
   * Restrict the pass to a single slide. When omitted, the designer is run
   * over every slide and operations are accumulated and applied in one batch.
   */
  slideId?: string;
  options?: {
    focus?: DesignFocus[];
    maxOperations?: number;
  };
  /**
   * Optional designer override. When omitted, the handler uses the value set
   * via `setSlideDesigner()`. Throws if neither is set.
   */
  designer?: SlideDesigner;
};

export type DesignPassRationale = {
  slideId: string;
  rationale?: string;
};

export type DesignPassOutput = {
  presentation: PresentationIR;
  operations: PresentationOperation[];
  rationales: DesignPassRationale[];
};

// ---------------------------------------------------------------------------
// presentation_visual_review
// ---------------------------------------------------------------------------

export type VisualReviewInput = {
  presentation: PresentationIR;
  /** Pre-rendered slide images (optional). */
  slideImages?: SlideImage[];
  focus?: VisualReviewFocus[];
  /**
   * Optional reviewer override. When omitted, the handler uses the value set
   * via `setVisualReviewer()`. Throws if neither is set.
   */
  visualReviewer?: VisualReviewer;
};

export type VisualReviewOutput = {
  findings: VisualReviewFinding[];
  operations: PresentationOperation[];
};

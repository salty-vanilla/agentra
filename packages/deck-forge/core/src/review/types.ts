import type {
  AssetSpec,
  DeckPlan,
  PresentationBrief,
  PresentationIR,
  SlideSpec,
  ValidationReport,
} from "#src/index.js";
import type { InspectResult } from "#src/inspect/types.js";
import type { PresentationOperation } from "#src/operations/types.js";

export type SlideImage = {
  slideId: string;
  mimeType: "image/png" | "image/jpeg";
  data: Uint8Array;
  width?: number;
  height?: number;
  source?: "ir-html" | "pptx" | "external";
  renderer?: string;
};

export type SlideImageRenderInput = {
  presentation: PresentationIR;
  slideIds?: string[];
  format?: "png" | "jpeg";
  scale?: number;
};

export interface SlideImageRenderer {
  render(input: SlideImageRenderInput): Promise<SlideImage[]>;
}

export type ReviewGrounding = {
  language?: string;
  requestedSlideCount?: number;
  mustInclude?: string[];
  mustAvoid?: string[];
};

export type BuildReviewPacketOptions = {
  userRequest: string;
  presentation: PresentationIR;
  brief?: PresentationBrief;
  deckPlan?: DeckPlan;
  slideSpecs?: SlideSpec[];
  assetSpecs?: AssetSpec[];
  validationReport?: ValidationReport;
  grounding?: ReviewGrounding;
  renderer?: SlideImageRenderer;
  renderImages?: boolean;
  slideIds?: string[];
  imageFormat?: "png" | "jpeg";
  imageScale?: number;
};

export type PresentationReviewPacket = {
  userRequest: string;
  brief?: PresentationBrief;
  deckPlan?: DeckPlan;
  slideSpecs?: SlideSpec[];
  assetSpecs?: AssetSpec[];
  presentation: PresentationIR;
  validationReport?: ValidationReport;
  inspect: InspectResult;
  slideImages?: SlideImage[];
  warnings?: string[];
  grounding?: ReviewGrounding;
};

export type SlideImageExportResult = {
  images: SlideImage[];
};

// ---------------------------------------------------------------------------
// Visual review
// ---------------------------------------------------------------------------

export type VisualReviewFocus =
  | "overlap"
  | "hierarchy"
  | "color"
  | "typography"
  | "decoration"
  | "balance";

export type VisualReviewSeverity = "info" | "warning" | "error";

export type VisualReviewFinding = {
  slideId: string;
  /** Optional element this finding pertains to. */
  elementId?: string;
  severity: VisualReviewSeverity;
  /** Free-form category tag (e.g. "overlap", "low-contrast"). */
  category: string;
  message: string;
  /**
   * Optional anchor pointing into the inspect tree, useful for downstream
   * UIs that highlight the offending region.
   */
  anchor?: string;
};

export type VisualReviewerInput = {
  presentation: PresentationIR;
  /** Slide images already rendered by the runtime (optional). */
  slideImages?: SlideImage[];
  /** Output of `inspectPresentation()` (optional, for grounding). */
  inspectSummary?: InspectResult;
  /** Existing validation report (optional). */
  validationReport?: ValidationReport;
  focus?: VisualReviewFocus[];
};

export type VisualReviewerOutput = {
  findings: VisualReviewFinding[];
  /** Operations the reviewer suggests to address the findings. */
  operations: PresentationOperation[];
};

/**
 * A `VisualReviewer` inspects rendered slide images plus structural data and
 * proposes a set of findings + operations. deck-forge ships only the
 * interface; concrete VLM-powered reviewers live in agentra (or other
 * downstream packages).
 */
export interface VisualReviewer {
  readonly name: string;
  review(input: VisualReviewerInput): Promise<VisualReviewerOutput>;
}

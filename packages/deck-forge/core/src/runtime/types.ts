import type { SlideDesigner } from "#src/design/types.js";
import type {
  ExportOptions,
  ExportResult,
  Exporter,
  PresentationIR,
  ValidationReport,
} from "#src/index.js";
import type { ImageGenerator } from "#src/index.js";
import type { InspectQuery, InspectResult } from "#src/inspect/types.js";
import type { PresentationOperation } from "#src/operations/types.js";
import type {
  BuildReviewPacketOptions,
  PresentationReviewPacket,
  SlideImageRenderer,
  VisualReviewer,
} from "#src/review/types.js";
import type { RuntimeSafetyOptions } from "#src/runtime/path-policy.js";
import type { ValidateOptions } from "#src/validation/types.js";

export type CreatePresentationInput = {
  id?: string;
  version?: string;
  title: string;
  theme: PresentationIR["theme"];
  brief?: PresentationIR["brief"];
  deckPlan?: PresentationIR["deckPlan"];
  slides?: PresentationIR["slides"];
  assets?: PresentationIR["assets"];
  meta?: Partial<Omit<PresentationIR["meta"], "title">>;
};

export interface PresentationRuntime {
  create(input: CreatePresentationInput): Promise<PresentationIR>;
  applyOperations(
    presentation: PresentationIR,
    operations: PresentationOperation[],
  ): Promise<PresentationIR>;
  inspect(presentation: PresentationIR, query: InspectQuery): Promise<InspectResult>;
  validate(presentation: PresentationIR, options?: ValidateOptions): Promise<ValidationReport>;
  export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult>;
  buildReviewPacket?(
    presentation: PresentationIR,
    options: RuntimeReviewPacketOptions,
  ): Promise<PresentationReviewPacket>;
}

export type PresentationValidator = (
  presentation: PresentationIR,
  options?: ValidateOptions,
) => Promise<ValidationReport>;

export type LocalPresentationRuntimeOptions = {
  exporters: Exporter[];
  imageGenerators?: ImageGenerator[];
  slideImageRenderer?: SlideImageRenderer;
  validator?: PresentationValidator;
  designer?: SlideDesigner;
  visualReviewer?: VisualReviewer;
  safety?: RuntimeSafetyOptions;
  layoutResolver?: unknown;
};

export type RuntimeReviewPacketOptions = Omit<
  BuildReviewPacketOptions,
  "presentation" | "renderer"
>;

export type PresentationReviewPacketBuilder = (
  presentation: PresentationIR,
  options: RuntimeReviewPacketOptions,
) => Promise<PresentationReviewPacket>;

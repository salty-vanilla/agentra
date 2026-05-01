import type { SlideDesigner, SlideDesignerInput } from "#src/design/types.js";
import type { PresentationIR } from "#src/index.js";
import { applyOperations } from "#src/operations/apply-operations.js";
import type { PresentationOperation } from "#src/operations/types.js";
import type {
  SlideImage,
  SlideImageRenderer,
  VisualReviewFinding,
  VisualReviewFocus,
  VisualReviewer,
} from "#src/review/types.js";
import type { PresentationValidator } from "#src/runtime/types.js";
import type { ValidationReport } from "#src/validation/types.js";

export type DesignReviewLoopInput = {
  presentation: PresentationIR;
  /** Optional designer pass run at the start of every iteration. */
  designer?: SlideDesigner;
  designerOptions?: SlideDesignerInput["options"];
  /** Required: the visual reviewer that critiques rendered slide images. */
  visualReviewer: VisualReviewer;
  /** Required: renderer used to materialize slide images per iteration. */
  renderer: SlideImageRenderer;
  /** Maximum number of iterations. Default: 1. */
  maxIterations?: number;
  /** Visual review focus. */
  focus?: VisualReviewFocus[];
  /**
   * Optional early-stop hook. Return `true` from this callback to exit the
   * loop after the current iteration even if `maxIterations` has not been
   * reached yet (e.g. when there are no error-severity findings left).
   */
  stopWhen?: (iteration: DesignReviewIterationTrace) => boolean;
  /**
   * Optional final validation pass. Use this with level="export" when the
   * renderer is checking the real exported surface (for example PPTX images).
   */
  validateFinal?: PresentationValidator;
  finalValidationLevel?: "basic" | "strict" | "export";
};

export type DesignReviewIterationTrace = {
  iteration: number;
  /** Operations applied during this iteration (designer + reviewer). */
  operations: PresentationOperation[];
  /** Slide images rendered for this iteration (post-designer pass). */
  slideImages: SlideImage[];
  /** Visual reviewer findings produced for this iteration. */
  findings: VisualReviewFinding[];
  /** Optional designer rationales for this iteration. */
  designerRationales?: { slideId: string; rationale?: string }[];
  /** Whether the iteration produced any operations. Used as a default stop. */
  converged: boolean;
};

export type DesignReviewLoopOutput = {
  presentation: PresentationIR;
  iterations: DesignReviewIterationTrace[];
  stoppedReason: "converged" | "max-iterations" | "stop-when";
  finalValidationReport?: ValidationReport;
};

/**
 * Drive an iterative design + visual-review loop:
 *
 *   for each iteration up to `maxIterations`:
 *     1. (optional) run `designer.designSlide()` over every slide, apply ops
 *     2. render slide images via `renderer`
 *     3. run `visualReviewer.review()` on the images, apply ops
 *     4. if both passes produced no operations, stop ("converged")
 *
 * The returned trace contains one entry per iteration plus the stop reason,
 * so callers can surface progress in MCP responses or UIs.
 */
export async function runDesignReviewLoop(
  input: DesignReviewLoopInput,
): Promise<DesignReviewLoopOutput> {
  const maxIterations = input.maxIterations ?? 1;
  const iterations: DesignReviewIterationTrace[] = [];
  let presentation = input.presentation;
  let stoppedReason: DesignReviewLoopOutput["stoppedReason"] = "max-iterations";

  for (let i = 0; i < maxIterations; i += 1) {
    const ops: PresentationOperation[] = [];
    let designerRationales: DesignReviewIterationTrace["designerRationales"];

    // 1. Designer pass.
    if (input.designer) {
      designerRationales = [];
      for (const slide of presentation.slides) {
        const result = await input.designer.designSlide({
          slide,
          presentation,
          theme: presentation.theme,
          brief: presentation.brief,
          options: input.designerOptions,
        });
        ops.push(...result.operations);
        designerRationales.push({ slideId: slide.id, rationale: result.rationale });
      }
      if (ops.length > 0) {
        presentation = await applyOperations(presentation, ops);
      }
    }

    // 2. Render images.
    const slideImages = await input.renderer.render({ presentation });

    // 3. Visual review.
    const reviewResult = await input.visualReviewer.review({
      presentation,
      slideImages,
      focus: input.focus,
    });
    if (reviewResult.operations.length > 0) {
      ops.push(...reviewResult.operations);
      presentation = await applyOperations(presentation, reviewResult.operations);
    }

    const trace: DesignReviewIterationTrace = {
      iteration: i,
      operations: ops,
      slideImages,
      findings: reviewResult.findings,
      designerRationales,
      converged: ops.length === 0,
    };
    iterations.push(trace);

    if (input.stopWhen?.(trace)) {
      stoppedReason = "stop-when";
      break;
    }
    if (trace.converged) {
      stoppedReason = "converged";
      break;
    }
  }

  const finalValidationReport = input.validateFinal
    ? await input.validateFinal(presentation, { level: input.finalValidationLevel ?? "export" })
    : undefined;

  return { presentation, iterations, stoppedReason, finalValidationReport };
}

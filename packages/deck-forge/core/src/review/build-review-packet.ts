import { inspectPresentation } from "#src/inspect/inspect-presentation.js";
import type { BuildReviewPacketOptions, PresentationReviewPacket } from "#src/review/types.js";

export async function buildReviewPacket(
  options: BuildReviewPacketOptions,
): Promise<PresentationReviewPacket> {
  const warnings: string[] = [];
  const inspect = await inspectPresentation(options.presentation, {
    include: ["deck", "slides", "elements", "text", "layout", "assets", "validation"],
    slideId: options.slideIds?.length === 1 ? options.slideIds[0] : undefined,
  });

  let slideImages: PresentationReviewPacket["slideImages"] | undefined;
  if (options.renderImages && options.renderer) {
    try {
      slideImages = await options.renderer.render({
        presentation: options.presentation,
        slideIds: options.slideIds,
        format: options.imageFormat ?? "png",
        scale: options.imageScale,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Slide image rendering failed: ${message}`);
    }
  }
  if (options.renderImages && !options.renderer) {
    warnings.push("Slide image rendering was requested, but no SlideImageRenderer was provided.");
  }

  return {
    userRequest: options.userRequest,
    brief: options.brief ?? options.presentation.brief,
    deckPlan: options.deckPlan ?? options.presentation.deckPlan,
    slideSpecs: options.slideSpecs,
    assetSpecs: options.assetSpecs,
    presentation: options.presentation,
    validationReport: options.validationReport ?? options.presentation.validation,
    inspect,
    slideImages,
    warnings: warnings.length > 0 ? warnings : undefined,
    grounding: options.grounding,
  };
}

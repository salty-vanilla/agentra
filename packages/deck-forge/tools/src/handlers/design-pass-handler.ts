import { applyOperations } from "@deck-forge/core";
import type { PresentationOperation, SlideDesigner } from "@deck-forge/core";

import type { DesignPassInput, DesignPassOutput, DesignPassRationale } from "#src/types.js";

let designer: SlideDesigner | undefined;

export function setSlideDesigner(next: SlideDesigner | undefined): void {
  designer = next;
}

export function getSlideDesigner(): SlideDesigner | undefined {
  return designer;
}

/**
 * Run a `SlideDesigner` over one slide (when `slideId` is set) or every slide
 * in the presentation, accumulate the proposed operations, apply them, and
 * return the updated presentation along with per-slide rationales.
 *
 * The designer can be supplied per-call via `input.designer`, or registered
 * once via `setSlideDesigner()`. If neither is set the handler throws.
 */
export async function designPassHandler(input: DesignPassInput): Promise<DesignPassOutput> {
  const active = input.designer ?? designer;
  if (!active) {
    throw new Error(
      "DESIGNER_ERROR: SlideDesigner is not configured. Pass `designer` in the input or call `setSlideDesigner()`.",
    );
  }

  const { presentation, slideId, options } = input;
  const targetSlides = slideId
    ? presentation.slides.filter((slide) => slide.id === slideId)
    : presentation.slides;

  if (slideId && targetSlides.length === 0) {
    throw new Error(`DESIGNER_ERROR: Slide not found: ${slideId}`);
  }

  const allOperations: PresentationOperation[] = [];
  const rationales: DesignPassRationale[] = [];
  for (const slide of targetSlides) {
    const result = await active.designSlide({
      slide,
      presentation,
      theme: presentation.theme,
      brief: presentation.brief,
      options,
    });
    allOperations.push(...result.operations);
    rationales.push({ slideId: slide.id, rationale: result.rationale });
  }

  const next = await applyOperations(presentation, allOperations);
  return { presentation: next, operations: allOperations, rationales };
}

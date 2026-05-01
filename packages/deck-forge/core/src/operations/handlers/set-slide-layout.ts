import type { PresentationIR } from "#src/index.js";
import type { SetSlideLayoutOperation } from "#src/operations/types.js";
import {
  createResolvedRegions,
  findSlide,
  reflowElementsIntoLayoutRegions,
} from "#src/operations/utils.js";

export function setSlideLayout(
  presentation: PresentationIR,
  operation: SetSlideLayoutOperation,
): void {
  const slide = findSlide(presentation, operation.slideId);

  slide.layout = {
    ...slide.layout,
    spec: operation.layout,
    regions: createResolvedRegions(operation.layout, slide.layout.slideSize),
  };

  // Reflow existing elements into the new region geometry so the PPTX renderer,
  // which reads `element.frame` exclusively, sees the layout change reflected
  // in the actual element positions. Invalid/missing contentRefs are silently
  // dropped inside the reflow utility — this call must never throw.
  reflowElementsIntoLayoutRegions(slide);
}

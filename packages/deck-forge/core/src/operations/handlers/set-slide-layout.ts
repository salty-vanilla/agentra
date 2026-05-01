import type { PresentationIR } from "#src/index.js";
import type { SetSlideLayoutOperation } from "#src/operations/types.js";
import { createResolvedRegions, findSlide } from "#src/operations/utils.js";

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
}

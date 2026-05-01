import type { PresentationIR } from "#src/index.js";
import type { AddSlideOperation } from "#src/operations/types.js";
import { createSlide, reindexSlides } from "#src/operations/utils.js";

export function addSlide(presentation: PresentationIR, operation: AddSlideOperation): void {
  const nextIndex = clampIndex(
    operation.index ?? presentation.slides.length,
    presentation.slides.length,
  );
  const slide = createSlide(presentation, {
    slideId: operation.slideId,
    title: operation.title,
    intent: operation.intent,
    layout: operation.layout,
    index: nextIndex,
  });

  presentation.slides.splice(nextIndex, 0, slide);
  reindexSlides(presentation);
}

function clampIndex(index: number, slideCount: number): number {
  if (index < 0) {
    return 0;
  }

  if (index > slideCount) {
    return slideCount;
  }

  return index;
}

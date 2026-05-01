import type { PresentationIR } from "#src/index.js";
import type { MoveSlideOperation } from "#src/operations/types.js";
import { findSlide, reindexSlides } from "#src/operations/utils.js";

export function moveSlide(presentation: PresentationIR, operation: MoveSlideOperation): void {
  findSlide(presentation, operation.slideId); // throws if not found

  const fromIndex = presentation.slides.findIndex((slide) => slide.id === operation.slideId);
  const slideCount = presentation.slides.length;
  const toIndex = Math.max(0, Math.min(operation.toIndex, slideCount - 1));

  if (fromIndex === toIndex) {
    return;
  }

  const [removed] = presentation.slides.splice(fromIndex, 1);
  if (removed) {
    presentation.slides.splice(toIndex, 0, removed);
  }

  reindexSlides(presentation);
}

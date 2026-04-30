import type { PresentationIR } from "#src/index.js";
import type { RemoveSlideOperation } from "#src/operations/types.js";
import { findSlide, reindexSlides } from "#src/operations/utils.js";

export function removeSlide(presentation: PresentationIR, operation: RemoveSlideOperation): void {
  findSlide(presentation, operation.slideId); // throws if not found

  presentation.slides = presentation.slides.filter((slide) => slide.id !== operation.slideId);
  reindexSlides(presentation);
}

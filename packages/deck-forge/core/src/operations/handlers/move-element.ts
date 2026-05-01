import { clampFrameToSlide } from "#src/geometry/frame-geometry.js";
import type { PresentationIR } from "#src/index.js";
import type { MoveElementOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

export function moveElement(
  presentation: PresentationIR,
  operation: MoveElementOperation,
): void {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return;

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return;

  const slideSize = slide.layout.slideSize;
  const rawFrame = {
    x: operation.x,
    y: operation.y,
    width: element.frame.width,
    height: element.frame.height,
  };

  element.frame = clampFrameToSlide(rawFrame, slideSize);
}

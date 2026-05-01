import { clampFrameToSlide } from "#src/geometry/frame-geometry.js";
import type { PresentationIR } from "#src/index.js";
import type { ResizeElementOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

const MIN_SIZE = 20;

export function resizeElement(
  presentation: PresentationIR,
  operation: ResizeElementOperation,
): void {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return;

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return;

  const slideSize = slide.layout.slideSize;
  const rawFrame = {
    x: element.frame.x,
    y: element.frame.y,
    width: Math.max(MIN_SIZE, operation.width),
    height: Math.max(MIN_SIZE, operation.height),
  };

  element.frame = clampFrameToSlide(rawFrame, slideSize);
}

import { clampFrameToSlide } from "#src/geometry/frame-geometry.js";
import type { PresentationIR } from "#src/index.js";
import type { SetElementFrameOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

const MIN_SIZE = 20;

export function setElementFrame(
  presentation: PresentationIR,
  operation: SetElementFrameOperation,
): void {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return;

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return;

  const slideSize = slide.layout.slideSize;
  const rawFrame = {
    x: operation.frame.x,
    y: operation.frame.y,
    width: Math.max(MIN_SIZE, operation.frame.width),
    height: Math.max(MIN_SIZE, operation.frame.height),
  };

  element.frame = clampFrameToSlide(rawFrame, slideSize);
}

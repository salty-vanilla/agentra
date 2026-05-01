import { clampFrameToSlide } from "#src/geometry/frame-geometry.js";
import type { PresentationIR } from "#src/index.js";
import type { OperationHandlerResult } from "#src/operations/handler-result.js";
import type { MoveElementOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

export function moveElement(
  presentation: PresentationIR,
  operation: MoveElementOperation,
): OperationHandlerResult {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return { status: "skipped", reason: "slide_not_found" };

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return { status: "skipped", reason: "element_not_found" };

  const slideSize = slide.layout.slideSize;
  const rawFrame = {
    x: operation.x,
    y: operation.y,
    width: element.frame.width,
    height: element.frame.height,
  };

  element.frame = clampFrameToSlide(rawFrame, slideSize);
  return { status: "applied" };
}

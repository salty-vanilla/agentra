import type { PresentationIR, TextElementIR } from "#src/index.js";
import type { AddTextOperation } from "#src/operations/types.js";
import {
  collectElementIds,
  findSlide,
  generateId,
  getDefaultTextStyle,
  getTargetFrame,
  toRichText,
} from "#src/operations/utils.js";

export function addText(presentation: PresentationIR, operation: AddTextOperation): void {
  const slide = findSlide(presentation, operation.slideId);
  const elementId = operation.elementId ?? generateId("el", collectElementIds(presentation));

  const textElement: TextElementIR = {
    id: elementId,
    type: "text",
    role: operation.role,
    text: toRichText(operation.text),
    frame: getTargetFrame(slide, operation.regionId),
    style: getDefaultTextStyle(presentation, operation.style),
  };

  slide.elements.push(textElement);
}

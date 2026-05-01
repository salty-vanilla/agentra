import type { PresentationIR } from "#src/index.js";
import type { DeleteElementOperation } from "#src/operations/types.js";
import { findSlide } from "#src/operations/utils.js";

export function deleteElement(
  presentation: PresentationIR,
  operation: DeleteElementOperation,
): void {
  const slide = findSlide(presentation, operation.slideId);
  const exists = slide.elements.some((el) => el.id === operation.elementId);

  if (!exists) {
    throw new Error(`Element not found: ${operation.elementId} in slide ${operation.slideId}`);
  }

  slide.elements = slide.elements.filter((el) => el.id !== operation.elementId);
}

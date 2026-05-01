import type { PresentationIR } from "#src/index.js";
import type { UpdateElementStyleOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

export function updateElementStyle(
  presentation: PresentationIR,
  operation: UpdateElementStyleOperation,
): void {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return;

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return;

  // Shallow-merge style properties into existing element style
  if ("style" in element && element.style && typeof element.style === "object") {
    (element as { style: Record<string, unknown> }).style = {
      ...element.style,
      ...operation.style,
    };
  } else {
    (element as { style: Record<string, unknown> }).style = { ...operation.style };
  }
}

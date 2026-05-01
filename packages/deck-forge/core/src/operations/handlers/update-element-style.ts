import type { PresentationIR } from "#src/index.js";
import type { OperationHandlerResult } from "#src/operations/handler-result.js";
import type { UpdateElementStyleOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

function deepMergeStyle(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMergeStyle(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export function updateElementStyle(
  presentation: PresentationIR,
  operation: UpdateElementStyleOperation,
): OperationHandlerResult {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return { status: "skipped", reason: "slide_not_found" };

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return { status: "skipped", reason: "element_not_found" };

  if ("style" in element && element.style && typeof element.style === "object") {
    (element as { style: Record<string, unknown> }).style = deepMergeStyle(
      element.style as Record<string, unknown>,
      operation.style,
    );
  } else {
    (element as { style: Record<string, unknown> }).style = { ...operation.style };
  }

  return { status: "applied" };
}

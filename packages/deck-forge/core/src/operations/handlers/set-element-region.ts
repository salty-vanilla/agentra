import type { PresentationIR } from "#src/index.js";
import type { OperationHandlerResult } from "#src/operations/handler-result.js";
import type { SetElementRegionOperation } from "#src/operations/types.js";
import {
  findElementOrNull,
  findSlideOrNull,
  reflowElementsIntoLayoutRegions,
} from "#src/operations/utils.js";

export function setElementRegion(
  presentation: PresentationIR,
  operation: SetElementRegionOperation,
): OperationHandlerResult {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return { status: "skipped", reason: "slide_not_found" };

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return { status: "skipped", reason: "element_not_found" };

  const region = slide.layout.regions.find((r) => r.id === operation.regionId);
  if (!region) return { status: "skipped", reason: "region_not_found" };

  // Remove element from any previous region's contentRefs
  for (const r of slide.layout.regions) {
    if (r.contentRefs) {
      r.contentRefs = r.contentRefs.filter((ref) => ref !== operation.elementId);
    }
  }

  // Add element to new region's contentRefs
  if (!region.contentRefs) {
    region.contentRefs = [];
  }
  if (!region.contentRefs.includes(operation.elementId)) {
    region.contentRefs.push(operation.elementId);
  }

  // Reflow all elements into layout regions to avoid duplicate frames
  reflowElementsIntoLayoutRegions(slide);

  return { status: "applied" };
}

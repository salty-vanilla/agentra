import { clampFrameToSlide } from "#src/geometry/frame-geometry.js";
import type { PresentationIR } from "#src/index.js";
import type { SetElementRegionOperation } from "#src/operations/types.js";
import { findElementOrNull, findSlideOrNull } from "#src/operations/utils.js";

export function setElementRegion(
  presentation: PresentationIR,
  operation: SetElementRegionOperation,
): void {
  const slide = findSlideOrNull(presentation, operation.slideId);
  if (!slide) return;

  const element = findElementOrNull(slide, operation.elementId);
  if (!element) return;

  const region = slide.layout.regions.find((r) => r.id === operation.regionId);
  if (!region) return;

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

  // Assign element frame to region frame (clamped to slide bounds)
  const slideSize = slide.layout.slideSize;
  element.frame = clampFrameToSlide(region.frame, slideSize);
}

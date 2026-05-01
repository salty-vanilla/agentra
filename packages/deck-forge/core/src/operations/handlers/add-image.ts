import type { ImageElementIR, PresentationIR } from "#src/index.js";
import type { AddImageOperation } from "#src/operations/types.js";
import { collectElementIds, findSlide, generateId, getTargetFrame } from "#src/operations/utils.js";

export function addImage(presentation: PresentationIR, operation: AddImageOperation): void {
  const slide = findSlide(presentation, operation.slideId);
  const asset = presentation.assets.assets.find((item) => item.id === operation.assetId);

  if (!asset) {
    throw new Error(`Asset not found: ${operation.assetId}`);
  }

  const elementId = operation.elementId ?? generateId("el", collectElementIds(presentation));

  const imageElement: ImageElementIR = {
    id: elementId,
    type: "image",
    assetId: operation.assetId,
    role: operation.role,
    frame: getTargetFrame(slide, operation.regionId),
  };

  slide.elements.push(imageElement);
}

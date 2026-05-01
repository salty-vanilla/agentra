import type { Asset, PresentationIR } from "#src/index.js";
import type { AttachAssetOperation } from "#src/operations/types.js";
import { findSlide } from "#src/operations/utils.js";

export function attachAsset(presentation: PresentationIR, operation: AttachAssetOperation): void {
  // Add the asset to the registry (or update if it already exists)
  const existing = presentation.assets.assets.findIndex((a) => a.id === operation.asset.id);
  if (existing >= 0) {
    presentation.assets.assets[existing] = operation.asset;
  } else {
    presentation.assets.assets.push(operation.asset);
  }

  // Optionally register usage on a specific slide/element
  if (operation.slideId && operation.elementId && operation.role) {
    const slide = findSlide(presentation, operation.slideId);
    const element = slide.elements.find((el) => el.id === operation.elementId);

    if (element && element.type === "image") {
      // Update the assetId on the image element to point to the new asset
      element.assetId = operation.asset.id;
    }

    // Register usage record on the asset
    const asset = presentation.assets.assets.find((a) => a.id === operation.asset.id);
    if (asset) {
      const alreadyTracked = asset.usage.some(
        (u) => u.slideId === operation.slideId && u.elementId === operation.elementId,
      );
      if (!alreadyTracked && operation.slideId && operation.elementId) {
        asset.usage.push({
          slideId: operation.slideId,
          elementId: operation.elementId,
          role: operation.role,
        });
      }
    }
  }
}

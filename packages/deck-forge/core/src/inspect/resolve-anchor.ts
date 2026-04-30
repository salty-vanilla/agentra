import type { PresentationIR } from "#src/index.js";
import type { ResolvedAnchor } from "#src/inspect/types.js";

export function resolveAnchor(presentation: PresentationIR, anchorId: string): ResolvedAnchor {
  const parts = anchorId.split("/");
  const head = parts[0];

  if (!head) {
    throw new Error("Invalid anchor id.");
  }

  if (head === "deck") {
    const deckId = parts[1];
    if (!deckId || deckId !== presentation.id) {
      throw new Error(`Deck anchor not found: ${anchorId}`);
    }

    return {
      kind: "deck",
      anchorId,
      id: deckId,
      target: presentation,
    };
  }

  if (head === "slide" || head === "sl") {
    const slideId = parts[1];
    if (!slideId) {
      throw new Error(`Invalid slide anchor: ${anchorId}`);
    }

    const slide = presentation.slides.find((item) => item.id === slideId);
    if (!slide) {
      throw new Error(`Slide anchor not found: ${anchorId}`);
    }

    return {
      kind: "slide",
      anchorId,
      id: slideId,
      target: slide,
    };
  }

  if (head === "element" || head === "el") {
    const elementId = parts[1];
    if (!elementId) {
      throw new Error(`Invalid element anchor: ${anchorId}`);
    }

    const resolved = findElement(presentation, elementId);
    if (!resolved) {
      throw new Error(`Element anchor not found: ${anchorId}`);
    }

    return {
      kind: "element",
      anchorId,
      id: elementId,
      target: resolved.element,
      slideId: resolved.slideId,
    };
  }

  if (head === "asset" || head === "as") {
    const assetId = parts[1];
    if (!assetId) {
      throw new Error(`Invalid asset anchor: ${anchorId}`);
    }

    const asset = presentation.assets.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new Error(`Asset anchor not found: ${anchorId}`);
    }

    return {
      kind: "asset",
      anchorId,
      id: assetId,
      target: asset,
    };
  }

  if (head === "comment") {
    const threadId = parts[1];
    if (!threadId) {
      throw new Error(`Invalid comment anchor: ${anchorId}`);
    }

    for (const slide of presentation.slides) {
      const thread = slide.comments?.find((comment) => comment.id === threadId);
      if (thread) {
        return {
          kind: "comment",
          anchorId,
          id: threadId,
          target: {
            threadId: thread.id,
            slideId: slide.id,
          },
        };
      }
    }

    throw new Error(`Comment anchor not found: ${anchorId}`);
  }

  if (head === "text") {
    const elementId = parts[1];
    const rangeId = parts[3];

    if (!elementId || parts[2] !== "range" || !rangeId) {
      throw new Error(`Invalid text anchor: ${anchorId}`);
    }

    const resolved = findElement(presentation, elementId);
    if (!resolved || resolved.element.type !== "text") {
      throw new Error(`Text anchor not found: ${anchorId}`);
    }

    return {
      kind: "text_range",
      anchorId,
      id: rangeId,
      target: {
        elementId,
        rangeId,
      },
    };
  }

  if (head === "tr") {
    const rangeId = parts[1];
    if (!rangeId) {
      throw new Error(`Invalid text range anchor: ${anchorId}`);
    }

    return {
      kind: "text_range",
      anchorId,
      id: rangeId,
      target: {
        rangeId,
      },
    };
  }

  throw new Error(`Unsupported anchor type: ${head}`);
}

function findElement(
  presentation: PresentationIR,
  elementId: string,
): { slideId: string; element: PresentationIR["slides"][number]["elements"][number] } | null {
  for (const slide of presentation.slides) {
    const element = slide.elements.find((item) => item.id === elementId);
    if (element) {
      return {
        slideId: slide.id,
        element,
      };
    }
  }

  return null;
}

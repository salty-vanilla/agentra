import type { ElementIR, PresentationIR, SlideIR, TextElementIR } from "#src/index.js";
import { resolveAnchor } from "#src/inspect/resolve-anchor.js";
import type { InspectQuery, InspectResult } from "#src/inspect/types.js";

const DEFAULT_INCLUDE: NonNullable<InspectQuery["include"]> = [
  "deck",
  "slides",
  "elements",
  "text",
  "layout",
  "assets",
  "validation",
];

export async function inspectPresentation(
  presentation: PresentationIR,
  query: InspectQuery,
): Promise<InspectResult> {
  const includes = query.include ?? DEFAULT_INCLUDE;
  const slides = filterSlides(presentation.slides, query.slideId);
  const elements = filterElements(slides, query.elementId);

  const result: InspectResult = {};

  if (includes.includes("deck")) {
    result.deck = {
      id: presentation.id,
      version: presentation.version,
      title: presentation.meta.title,
      slideCount: presentation.slides.length,
      meta: presentation.meta,
    };
  }

  if (includes.includes("slides")) {
    result.slides = slides;
  }

  if (includes.includes("elements")) {
    result.elements = elements;
  }

  if (includes.includes("text")) {
    result.text = collectText(slides, query.elementId);
  }

  if (includes.includes("layout")) {
    result.layout = slides.map((slide) => ({
      slideId: slide.id,
      layout: slide.layout,
    }));
  }

  if (includes.includes("assets")) {
    const filteredAssets =
      query.elementId && elements.length > 0
        ? collectAssetsForElements(presentation, elements)
        : presentation.assets.assets;
    result.assets = filteredAssets;
  }

  if (includes.includes("validation")) {
    result.validation = presentation.validation;
  }

  if (query.targetId) {
    result.target = resolveAnchor(presentation, query.targetId);
  }

  return result;
}

function filterSlides(slides: SlideIR[], slideId?: string): SlideIR[] {
  if (!slideId) {
    return slides;
  }

  return slides.filter((slide) => slide.id === slideId);
}

function filterElements(slides: SlideIR[], elementId?: string): ElementIR[] {
  const all = slides.flatMap((slide) => slide.elements);

  if (!elementId) {
    return all;
  }

  return all.filter((element) => element.id === elementId);
}

function collectText(slides: SlideIR[], elementId?: string): InspectResult["text"] {
  const records: NonNullable<InspectResult["text"]> = [];

  for (const slide of slides) {
    for (const element of slide.elements) {
      if (element.type !== "text") {
        continue;
      }

      if (elementId && element.id !== elementId) {
        continue;
      }

      records.push({
        slideId: slide.id,
        elementId: element.id,
        role: element.role,
        text: flattenTextElement(element),
      });
    }
  }

  return records;
}

function flattenTextElement(element: TextElementIR): string {
  return element.text.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
}

function collectAssetsForElements(
  presentation: PresentationIR,
  elements: ElementIR[],
): PresentationIR["assets"]["assets"] {
  const imageAssetIds = new Set(
    elements
      .filter(
        (element): element is Extract<ElementIR, { type: "image" }> => element.type === "image",
      )
      .map((element) => element.assetId),
  );

  if (imageAssetIds.size === 0) {
    return [];
  }

  return presentation.assets.assets.filter((asset) => imageAssetIds.has(asset.id));
}

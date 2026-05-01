import {
  clampFrameToSlide,
  frameOverlapRatio,
  stackFramesVertically,
} from "#src/geometry/frame-geometry.js";
import type {
  ElementIR,
  LayoutSpec,
  OperationRecord,
  PresentationIR,
  ResolvedFrame,
  ResolvedRegion,
  RichText,
  SlideIR,
  SlideSize,
  TextStyle,
} from "#src/index.js";
import type { PresentationOperation } from "#src/operations/types.js";

const DEFAULT_SLIDE_SIZE: SlideSize = {
  width: 1280,
  height: 720,
  unit: "px",
};

const DEFAULT_PADDING = 80;

export function clonePresentation(presentation: PresentationIR): PresentationIR {
  return structuredClone(presentation);
}

export function getDefaultSlideSize(presentation: PresentationIR): SlideSize {
  return presentation.slides[0]?.layout.slideSize ?? DEFAULT_SLIDE_SIZE;
}

export function createSlide(
  presentation: PresentationIR,
  input: {
    slideId?: string;
    title?: string;
    intent?: SlideIR["intent"];
    layout: LayoutSpec;
    index: number;
  },
): SlideIR {
  const slideSize = getDefaultSlideSize(presentation);
  const id = input.slideId ?? generateId("slide", collectSlideIds(presentation));

  return {
    id,
    index: input.index,
    title: input.title,
    intent: input.intent,
    layout: {
      spec: input.layout,
      slideSize,
      regions: createResolvedRegions(input.layout, slideSize),
    },
    elements: [],
  };
}

export function createResolvedRegions(layout: LayoutSpec, slideSize: SlideSize): ResolvedRegion[] {
  if (layout.regions && layout.regions.length > 0) {
    return layout.regions.map((region) => ({
      ...region,
      frame: defaultFrameForRole(region.role, slideSize),
    }));
  }

  return [
    {
      id: "body",
      role: "body",
      contentRefs: [],
      priority: 1,
      frame: defaultFrameForRole("body", slideSize),
    },
  ];
}

// ── Standard layout bands ────────────────────────────────────────────
// These constants define the canonical vertical bands and column grid.
// All layout strategies derive positions from `defaultFrameForRole`, so
// changes here propagate automatically to every strategy.
export const LAYOUT_TITLE_Y = 80;
export const LAYOUT_TITLE_HEIGHT = 100;
export const LAYOUT_BODY_Y = 200;
export const LAYOUT_BODY_BOTTOM = 500;
export const LAYOUT_CALLOUT_Y = 520;
export const LAYOUT_CALLOUT_HEIGHT = 80;
export const LAYOUT_FOOTER_Y = 620;
export const LAYOUT_FOOTER_HEIGHT = 40;
export const LAYOUT_COLUMN_LEFT_X = 80;
export const LAYOUT_COLUMN_GUTTER = 40;
export const LAYOUT_COLUMN_RIGHT_X = 680;

export function defaultFrameForRole(
  role: ResolvedRegion["role"],
  slideSize: SlideSize,
): ResolvedFrame {
  const contentWidth = slideSize.width - DEFAULT_PADDING * 2;

  // Fixed vertical layout bands.
  const titleHeight = LAYOUT_TITLE_HEIGHT;
  const footerHeight = LAYOUT_FOOTER_HEIGHT;
  const footerY = LAYOUT_FOOTER_Y;
  const bodyY = LAYOUT_BODY_Y;
  // Vertical space between body-top and body-bottom.
  const bodyHeight = LAYOUT_BODY_BOTTOM - bodyY; // 280
  const calloutHeight = LAYOUT_CALLOUT_HEIGHT;
  // Split main area horizontally using the column grid.
  const gap = LAYOUT_COLUMN_GUTTER;
  const bodyWidth = LAYOUT_COLUMN_RIGHT_X - LAYOUT_COLUMN_LEFT_X - gap; // 560
  const visualWidth = contentWidth - bodyWidth - gap; // 520
  const visualX = LAYOUT_COLUMN_RIGHT_X;

  switch (role) {
    case "title":
      return { x: DEFAULT_PADDING, y: LAYOUT_TITLE_Y, width: contentWidth, height: titleHeight };

    case "visual":
      // Right column of the body zone.
      return { x: visualX, y: bodyY, width: visualWidth, height: bodyHeight };

    case "callout":
      // Fixed callout strip below the body zone.
      return {
        x: DEFAULT_PADDING,
        y: LAYOUT_CALLOUT_Y,
        width: contentWidth,
        height: calloutHeight,
      };

    case "sidebar":
      // Narrow left panel (25% of content width), spanning body+callout.
      return {
        x: DEFAULT_PADDING,
        y: bodyY,
        width: Math.round(contentWidth * 0.25),
        height: LAYOUT_CALLOUT_Y + calloutHeight - bodyY,
      };

    case "footer":
      return { x: DEFAULT_PADDING, y: footerY, width: contentWidth, height: footerHeight };
    default:
      // Left column of the body zone.
      return { x: DEFAULT_PADDING, y: bodyY, width: bodyWidth, height: bodyHeight };
  }
}

export function getTargetFrame(slide: SlideIR, regionId?: string): ResolvedFrame {
  if (regionId) {
    const exact = slide.layout.regions.find((region) => region.id === regionId);
    if (exact) {
      return exact.frame;
    }
  }

  const bodyRegion = slide.layout.regions.find((region) => region.role === "body");
  if (bodyRegion) {
    return bodyRegion.frame;
  }

  return defaultFrameForRole("body", slide.layout.slideSize);
}

export function toRichText(text: string | RichText): RichText {
  if (typeof text !== "string") {
    return text;
  }

  return {
    paragraphs: [
      {
        runs: [{ text }],
      },
    ],
  };
}

export function getDefaultTextStyle(
  presentation: PresentationIR,
  override?: Partial<TextStyle>,
): TextStyle {
  return {
    ...presentation.theme.elementDefaults.text,
    ...override,
  };
}

export function findSlide(presentation: PresentationIR, slideId: string): SlideIR {
  const slide = presentation.slides.find((current) => current.id === slideId);
  if (!slide) {
    throw new Error(`Slide not found: ${slideId}`);
  }

  return slide;
}

export function findSlideOrNull(
  presentation: PresentationIR,
  slideId: string,
): SlideIR | undefined {
  return presentation.slides.find((current) => current.id === slideId);
}

export function findElementOrNull(
  slide: SlideIR,
  elementId: string,
): ElementIR | undefined {
  return slide.elements.find((el) => el.id === elementId);
}

export function generateId(prefix: string, existing: Set<string>): string {
  let counter = existing.size + 1;

  while (existing.has(`${prefix}-${counter}`)) {
    counter += 1;
  }

  return `${prefix}-${counter}`;
}

export function collectSlideIds(presentation: PresentationIR): Set<string> {
  return new Set(presentation.slides.map((slide) => slide.id));
}

export function collectElementIds(presentation: PresentationIR): Set<string> {
  const ids = new Set<string>();

  for (const slide of presentation.slides) {
    for (const element of slide.elements) {
      ids.add(element.id);
    }
  }

  return ids;
}

export function reindexSlides(presentation: PresentationIR): void {
  presentation.slides.forEach((slide, index) => {
    slide.index = index;
  });
}

export function appendOperationRecord(
  presentation: PresentationIR,
  operation: PresentationOperation,
  result: "success" | "failed" | "skipped",
  error?: string,
): void {
  const recordId = `op-${presentation.operationLog.length + 1}`;
  const record: OperationRecord = {
    id: recordId,
    timestamp: new Date().toISOString(),
    actor: "system",
    operation,
    result,
    error,
  };

  presentation.operationLog.push(record);
}

// ---------------------------------------------------------------------------
// Layout / frame synchronization (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Returns true when an element should be left untouched by region reflow.
 *
 * Decorative / background / very-low-opacity shapes are typically used as
 * full-bleed accents, dividers or watermarks. Forcing them into a content
 * region would visibly break intentional layering, so reflow skips them.
 * They are still clamped to slide bounds.
 */
export function isDecorativeElement(element: ElementIR): boolean {
  if (element.type === "image" && element.role === "background") {
    return true;
  }
  if (element.type === "shape") {
    const opacity = element.style.opacity ?? 1;
    if (opacity <= 0.15) {
      return true;
    }
  }
  return false;
}

/**
 * Map an element to the set of region roles it can naturally occupy.
 * Used by inference when a region's `contentRefs` does not name the element.
 */
function inferableRolesForElement(element: ElementIR): ResolvedRegion["role"][] {
  if (element.type === "text") {
    switch (element.role) {
      case "title":
      case "subtitle":
        return ["title"];
      case "footer":
        return ["footer"];
      case "caption":
        return ["footer", "callout", "body"];
      case "callout":
        return ["callout", "body"];
      default:
        return ["body", "sidebar"];
    }
  }
  if (element.type === "image") {
    return ["visual", "body"];
  }
  if (element.type === "table") {
    return ["table", "body", "visual"];
  }
  if (element.type === "chart") {
    return ["chart", "visual", "body"];
  }
  if (element.type === "diagram") {
    return ["visual", "body"];
  }
  // shape (non-decorative)
  return ["callout", "visual", "body"];
}

/**
 * Maximum reasonable height (in px) for small text-role frames. Prevents a
 * single subtitle from filling an entire body region after reflow.
 */
const SMALL_TEXT_ROLE_MAX_HEIGHT: Partial<Record<string, number>> = {
  title: 140,
  subtitle: 100,
  footer: 48,
  caption: 60,
  callout: 160,
};

/**
 * Returns a region-sized frame, possibly capped for small text roles.
 * Large content elements (table/chart/diagram/image) always use the full
 * region frame.
 */
function fitFrameForElement(element: ElementIR, regionFrame: ResolvedFrame): ResolvedFrame {
  if (element.type !== "text") {
    return { ...regionFrame };
  }
  const cap = SMALL_TEXT_ROLE_MAX_HEIGHT[element.role];
  if (cap == null || regionFrame.height <= cap) {
    return { ...regionFrame };
  }
  return {
    x: regionFrame.x,
    y: regionFrame.y,
    width: regionFrame.width,
    height: cap,
  };
}

export type ReflowOptions = {
  /** Skip decorative/background elements during reflow (default true). */
  skipDecorative?: boolean;
};

/**
 * Reflow a slide's elements into its current `layout.regions`.
 *
 * Mapping order for each element:
 *   1. Region whose `contentRefs` includes the element id (authoritative).
 *   2. Region whose role matches an inferable role for the element.
 *   3. Tie-break (within step 2) by previous-frame overlap with the region.
 *
 * Single-element regions assign the (possibly capped) region frame to the
 * element. Multi-element regions distribute elements vertically using
 * `stackFramesVertically`. Unmapped or decorative elements are left in place
 * but clamped to the slide bounds.
 *
 * Each region's `contentRefs` is rewritten to reflect the resolved mapping.
 */
export function reflowElementsIntoLayoutRegions(
  slide: SlideIR,
  options: ReflowOptions = {},
): void {
  const skipDecorative = options.skipDecorative ?? true;
  const slideSize = slide.layout.slideSize;
  const regions = slide.layout.regions;

  // Index elements by id for fast lookup.
  const elementsById = new Map<string, ElementIR>();
  for (const element of slide.elements) {
    elementsById.set(element.id, element);
  }

  // Track which elements have been claimed and by which region.
  const assignmentByElementId = new Map<string, string>();
  const orderedAssignments = new Map<string, ElementIR[]>();
  for (const region of regions) {
    orderedAssignments.set(region.id, []);
  }

  // Pass 1: explicit contentRefs (authoritative).
  for (const region of regions) {
    const claimed = orderedAssignments.get(region.id);
    if (!claimed) continue;
    for (const ref of region.contentRefs) {
      if (assignmentByElementId.has(ref)) continue;
      const element = elementsById.get(ref);
      if (!element) continue; // silently drop unknown ids
      if (skipDecorative && isDecorativeElement(element)) continue;
      claimed.push(element);
      assignmentByElementId.set(element.id, region.id);
    }
  }

  // Pass 2: role/type inference for remaining content-bearing elements.
  for (const element of slide.elements) {
    if (assignmentByElementId.has(element.id)) continue;
    if (skipDecorative && isDecorativeElement(element)) continue;
    const candidateRoles = inferableRolesForElement(element);
    let best: { region: ResolvedRegion; score: number } | undefined;
    for (const region of regions) {
      const roleIndex = candidateRoles.indexOf(region.role);
      if (roleIndex === -1) continue;
      // Lower roleIndex (more preferred role) wins; tie-break by previous-frame overlap.
      const overlap = frameOverlapRatio(element.frame, region.frame);
      // Compose score so role preference dominates, overlap breaks ties.
      const score = (candidateRoles.length - roleIndex) * 10 + overlap;
      if (!best || score > best.score) {
        best = { region, score };
      }
    }
    if (best) {
      const claimed = orderedAssignments.get(best.region.id);
      if (claimed) {
        claimed.push(element);
        assignmentByElementId.set(element.id, best.region.id);
      }
    }
  }

  // Apply frames per region.
  for (const region of regions) {
    const claimed = orderedAssignments.get(region.id) ?? [];
    if (claimed.length === 0) {
      region.contentRefs = [];
      continue;
    }
    if (claimed.length === 1) {
      const element = claimed[0];
      if (element) {
        const fitted = fitFrameForElement(element, region.frame);
        element.frame = clampFrameToSlide(fitted, slideSize);
      }
    } else {
      const stacked = stackFramesVertically(region.frame, claimed.length);
      claimed.forEach((element, index) => {
        const slot = stacked[index];
        if (!slot) return;
        const fitted = fitFrameForElement(element, slot);
        element.frame = clampFrameToSlide(fitted, slideSize);
      });
    }
    region.contentRefs = claimed.map((element) => element.id);
  }

  // Clamp any unassigned elements (decorative or unmatched) to slide bounds.
  for (const element of slide.elements) {
    if (assignmentByElementId.has(element.id)) continue;
    element.frame = clampFrameToSlide(element.frame, slideSize);
  }
}


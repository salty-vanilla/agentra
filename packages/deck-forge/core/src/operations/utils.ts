import type {
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

export function defaultFrameForRole(
  role: ResolvedRegion["role"],
  slideSize: SlideSize,
): ResolvedFrame {
  const contentWidth = slideSize.width - DEFAULT_PADDING * 2;
  const contentHeight = slideSize.height - DEFAULT_PADDING * 2;

  // Title band: top 20% of content area.
  const titleHeight = Math.round(contentHeight * 0.2);
  // Content zone: below title, above footer.
  const footerHeight = 40;
  const footerY = slideSize.height - DEFAULT_PADDING - footerHeight;
  const bodyY = DEFAULT_PADDING + titleHeight;
  // Vertical space between title-bottom and footer-top.
  const bodyHeight = footerY - bodyY;
  // Reserve the bottom 22% of bodyHeight for callout / caption strips.
  const calloutHeight = Math.round(bodyHeight * 0.22);
  const mainHeight = bodyHeight - calloutHeight;
  // Split main area horizontally: body 60% left, visual 40% right.
  const gap = 16;
  const visualWidth = Math.round(contentWidth * 0.4);
  const bodyWidth = contentWidth - visualWidth - gap;
  const visualX = DEFAULT_PADDING + bodyWidth + gap;

  switch (role) {
    case "title":
      return { x: DEFAULT_PADDING, y: DEFAULT_PADDING, width: contentWidth, height: titleHeight };

    case "visual":
      // Right 40% of the body zone.
      return { x: visualX, y: bodyY, width: visualWidth, height: mainHeight };

    case "callout":
      // Bottom strip of the body zone.
      return {
        x: DEFAULT_PADDING,
        y: bodyY + mainHeight,
        width: contentWidth,
        height: calloutHeight,
      };

    case "sidebar":
      // Narrow left panel (25% of content width).
      return {
        x: DEFAULT_PADDING,
        y: bodyY,
        width: Math.round(contentWidth * 0.25),
        height: bodyHeight,
      };

    case "footer":
      return { x: DEFAULT_PADDING, y: footerY, width: contentWidth, height: footerHeight };
    default:
      // Left 60% body zone (safe default that leaves room for a visual region).
      return { x: DEFAULT_PADDING, y: bodyY, width: bodyWidth, height: mainHeight };
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
  result: "success" | "failed",
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

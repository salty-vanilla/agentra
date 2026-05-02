import { describe, expect, it } from "vitest";
import {
  analyzeSlideLayout,
  analyzeDeckLayout,
} from "#src/diagnostics/layout-diagnostics.js";
import type { PresentationIR, SlideIR, ElementIR, ResolvedLayout } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLIDE_SIZE = { width: 1280, height: 720, unit: "px" as const };

function makeLayout(overrides?: Partial<ResolvedLayout>): ResolvedLayout {
  return {
    spec: { type: "single_column", density: "medium" as const, emphasis: "top" as const },
    slideSize: SLIDE_SIZE,
    regions: [],
    ...overrides,
  };
}

function makeTextElement(
  id: string,
  frame: { x: number; y: number; width: number; height: number },
): ElementIR {
  return {
    id,
    type: "text",
    role: "body",
    text: { paragraphs: [{ runs: [{ text: "sample" }] }] },
    frame,
    style: {},
  } as unknown as ElementIR;
}

function makeSlide(overrides: Partial<SlideIR> & { elements?: ElementIR[] }): SlideIR {
  return {
    id: overrides.id ?? "slide-1",
    index: overrides.index ?? 0,
    title: overrides.title ?? "Test Slide",
    layout: overrides.layout ?? makeLayout(),
    elements: overrides.elements ?? [],
    ...overrides,
  } as SlideIR;
}

function makePresentation(slides: SlideIR[]): PresentationIR {
  return {
    id: "deck-test",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    theme: {
      colors: { primary: "#002855", secondary: "#C8102E", accent: "#F2A900", background: "#FFFFFF", surface: "#F5F5F5", text: "#1A1A1A", textSecondary: "#666666", success: "#22C55E", warning: "#F59E0B", error: "#EF4444" },
      typography: { titleFontFamily: "Inter", bodyFontFamily: "Inter", baseFontSize: 24 },
      spacing: { padding: 40 },
      radius: 8,
      slideDefaults: {},
      elementDefaults: {},
    },
    slides,
    assets: { assets: [] },
    operationLog: [],
  } as unknown as PresentationIR;
}

// ---------------------------------------------------------------------------
// analyzeSlideLayout
// ---------------------------------------------------------------------------

describe("analyzeSlideLayout", () => {
  it("returns diagnostics for a normal slide with trace", () => {
    const slide = makeSlide({
      id: "s1",
      index: 0,
      elements: [
        makeTextElement("e1", { x: 80, y: 20, width: 400, height: 50 }),
        makeTextElement("e2", { x: 80, y: 100, width: 400, height: 200 }),
      ],
      _trace: {
        layoutStrategyId: "content",
        layoutSpecType: "single_column",
        templateProfileId: "executive-navy-v1",
        templateLayoutId: "content-standard",
        templateLayoutKind: "content",
        usedSlots: ["title", "body"],
        fallbackSlots: [],
      },
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.slideId).toBe("s1");
    expect(diag.layoutStrategyId).toBe("content");
    expect(diag.templateLayoutId).toBe("content-standard");
    expect(diag.usedSlots).toEqual(["body", "title"]);
    expect(diag.fallbackSlots).toEqual([]);
    expect(diag.overlapCount).toBe(0);
    expect(diag.outOfBoundsCount).toBe(0);
    expect(diag.warnings.length).toBe(0);
  });

  it("emits missing_template_trace when _trace is absent", () => {
    const slide = makeSlide({
      elements: [makeTextElement("e1", { x: 10, y: 10, width: 100, height: 50 })],
    });
    // no _trace

    const diag = analyzeSlideLayout(slide);

    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "missing_template_trace", severity: "error" }),
    );
    expect(diag.usedSlots).toEqual([]);
    expect(diag.fallbackSlots).toEqual([]);
  });

  it("collects fallback slots and emits slot_fallback", () => {
    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "kpi-dashboard-with-insight",
        layoutSpecType: "two_column",
        templateProfileId: "exec-navy-v1",
        templateLayoutId: "visual-insight",
        templateLayoutKind: "visual-insight",
        usedSlots: ["title", "visual", "insight"],
        fallbackSlots: ["metrics", "cards"],
      },
      elements: [],
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.fallbackSlots).toEqual(["cards", "metrics"]);
    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "slot_fallback" }),
    );
  });

  it("emits too_many_fallback_slots when >= 3 fallbacks", () => {
    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "test",
        layoutSpecType: "single_column",
        templateProfileId: "test",
        templateLayoutId: "blank",
        templateLayoutKind: "blank",
        usedSlots: ["title"],
        fallbackSlots: ["a", "b", "c"],
      },
      elements: [],
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "too_many_fallback_slots", severity: "warning" }),
    );
  });

  it("detects overlapping elements", () => {
    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "test",
        layoutSpecType: "single_column",
        templateProfileId: "test",
        templateLayoutId: "content",
        templateLayoutKind: "content",
        usedSlots: ["body"],
        fallbackSlots: [],
      },
      elements: [
        makeTextElement("e1", { x: 100, y: 100, width: 400, height: 200 }),
        makeTextElement("e2", { x: 200, y: 150, width: 400, height: 200 }),
      ],
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.overlapCount).toBeGreaterThan(0);
    expect(diag.maxOverlapRatio).toBeGreaterThan(0);
    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "element_overlap" }),
    );
  });

  it("detects out-of-bounds elements", () => {
    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "test",
        layoutSpecType: "single_column",
        templateProfileId: "test",
        templateLayoutId: "content",
        templateLayoutKind: "content",
        usedSlots: ["body"],
        fallbackSlots: [],
      },
      elements: [
        makeTextElement("e1", { x: -10, y: 10, width: 200, height: 50 }),
        makeTextElement("e2", { x: 1200, y: 10, width: 200, height: 50 }),
      ],
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.outOfBoundsCount).toBe(2);
    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "element_out_of_bounds", severity: "error" }),
    );
  });

  it("emits too_many_elements when count exceeds threshold", () => {
    const elements = Array.from({ length: 16 }, (_, i) =>
      makeTextElement(`e${i}`, { x: 10, y: i * 40, width: 100, height: 30 }),
    );

    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "test",
        layoutSpecType: "single_column",
        templateProfileId: "test",
        templateLayoutId: "content",
        templateLayoutKind: "content",
        usedSlots: ["body"],
        fallbackSlots: [],
      },
      elements,
    });

    const diag = analyzeSlideLayout(slide);

    expect(diag.elementCount).toBe(16);
    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "too_many_elements" }),
    );
  });

  it("computes slot coverage ratio correctly", () => {
    const slide = makeSlide({
      _trace: {
        layoutStrategyId: "test",
        layoutSpecType: "single_column",
        templateProfileId: "test",
        templateLayoutId: "content",
        templateLayoutKind: "content",
        usedSlots: ["title", "body"],
        fallbackSlots: ["metrics", "cards", "cta"],
      },
      elements: [],
    });

    const diag = analyzeSlideLayout(slide);

    // 2 / (2 + 3) = 0.4
    expect(diag.slotCoverageRatio).toBeCloseTo(0.4, 3);
    expect(diag.warnings).toContainEqual(
      expect.objectContaining({ code: "low_slot_coverage" }),
    );
  });
});

// ---------------------------------------------------------------------------
// analyzeDeckLayout
// ---------------------------------------------------------------------------

describe("analyzeDeckLayout", () => {
  function makeTracedSlide(
    id: string,
    index: number,
    opts: {
      strategyId: string;
      layoutKind: string;
      layoutId: string;
      usedSlots: string[];
      fallbackSlots?: string[];
      elements?: ElementIR[];
    },
  ): SlideIR {
    return makeSlide({
      id,
      index,
      title: `Slide ${index + 1}`,
      elements: opts.elements ?? [
        makeTextElement(`${id}-title`, { x: 80, y: 20, width: 1120, height: 60 }),
        makeTextElement(`${id}-body`, { x: 80, y: 100, width: 1120, height: 500 }),
      ],
      _trace: {
        layoutStrategyId: opts.strategyId,
        layoutSpecType: "single_column",
        templateProfileId: "executive-navy-v1",
        templateLayoutId: opts.layoutId,
        templateLayoutKind: opts.layoutKind,
        usedSlots: opts.usedSlots,
        fallbackSlots: opts.fallbackSlots ?? [],
      },
    });
  }

  it("produces deck summary for a golden 6-slide scenario", () => {
    const slides = [
      makeTracedSlide("s1", 0, {
        strategyId: "title-slide",
        layoutKind: "cover",
        layoutId: "cover",
        usedSlots: ["title", "subtitle"],
      }),
      makeTracedSlide("s2", 1, {
        strategyId: "kpi-card-overview",
        layoutKind: "dashboard",
        layoutId: "dashboard-cards",
        usedSlots: ["title", "metrics", "callout"],
      }),
      makeTracedSlide("s3", 2, {
        strategyId: "kpi-dashboard-with-insight",
        layoutKind: "dashboard",
        layoutId: "dashboard-cards-with-chart",
        usedSlots: ["title", "metrics", "visual", "insight", "callout"],
      }),
      makeTracedSlide("s4", 3, {
        strategyId: "small-multiples-trend",
        layoutKind: "visual-insight",
        layoutId: "visual-top-insight-bottom",
        usedSlots: ["title", "visual", "insight"],
      }),
      makeTracedSlide("s5", 4, {
        strategyId: "process-flow-with-impact",
        layoutKind: "process",
        layoutId: "process-with-impact",
        usedSlots: ["title", "process", "impact", "callout"],
      }),
      makeTracedSlide("s6", 5, {
        strategyId: "action-plan-table",
        layoutKind: "table",
        layoutId: "table-with-cta",
        usedSlots: ["title", "table", "cta"],
      }),
    ];

    const presentation = makePresentation(slides);
    const result = analyzeDeckLayout(presentation);

    expect(result.slides).toHaveLength(6);
    expect(result.summary.slideCount).toBe(6);

    // Template layout id usage
    expect(result.summary.templateLayoutIdUsage).toEqual({
      cover: 1,
      "dashboard-cards": 1,
      "dashboard-cards-with-chart": 1,
      "visual-top-insight-bottom": 1,
      "process-with-impact": 1,
      "table-with-cta": 1,
    });

    // Template layout kind usage
    expect(result.summary.templateLayoutKindUsage).toEqual({
      cover: 1,
      dashboard: 2,
      "visual-insight": 1,
      process: 1,
      table: 1,
    });

    // Layout strategy usage
    expect(result.summary.layoutStrategyUsage["title-slide"]).toBe(1);
    expect(result.summary.layoutStrategyUsage["kpi-dashboard-with-insight"]).toBe(1);
    expect(result.summary.layoutStrategyUsage["action-plan-table"]).toBe(1);

    // Fallback slots — clean scenario has no fallbacks now
    expect(result.summary.slidesWithFallbackSlots).toBe(0);

    // No overlaps or out-of-bounds in this clean scenario
    expect(result.summary.totalOverlapCount).toBe(0);
    expect(result.summary.totalOutOfBoundsCount).toBe(0);

    // Each slide has _trace
    for (const slideDiag of result.slides) {
      expect(slideDiag.templateLayoutId).toBeDefined();
      expect(slideDiag.layoutStrategyId).toBeDefined();
    }

    // Deploy readiness should not be fail
    expect(["pass", "warning"]).toContain(result.summary.deployReadiness.status);
  });

  it("reports fail deploy readiness when out-of-bounds exist", () => {
    const slides = [
      makeTracedSlide("s1", 0, {
        strategyId: "test",
        layoutKind: "content",
        layoutId: "content",
        usedSlots: ["title", "body"],
        elements: [
          makeTextElement("oob", { x: -50, y: 10, width: 200, height: 50 }),
        ],
      }),
    ];

    const presentation = makePresentation(slides);
    const result = analyzeDeckLayout(presentation);

    expect(result.summary.totalOutOfBoundsCount).toBe(1);
    expect(result.summary.deployReadiness.status).toBe("fail");
  });

  it("reports fail deploy readiness when severe overlap exists", () => {
    // Two nearly-identical frames → high overlap ratio
    const slides = [
      makeTracedSlide("s1", 0, {
        strategyId: "test",
        layoutKind: "content",
        layoutId: "content",
        usedSlots: ["body"],
        elements: [
          makeTextElement("a", { x: 100, y: 100, width: 500, height: 300 }),
          makeTextElement("b", { x: 110, y: 110, width: 500, height: 300 }),
        ],
      }),
    ];

    const presentation = makePresentation(slides);
    const result = analyzeDeckLayout(presentation);

    expect(result.summary.maxOverlapRatio).toBeGreaterThanOrEqual(0.15);
    expect(result.summary.deployReadiness.status).toBe("fail");
  });

  it("computes average slot coverage ratio", () => {
    const slides = [
      makeTracedSlide("s1", 0, {
        strategyId: "a",
        layoutKind: "content",
        layoutId: "content",
        usedSlots: ["title"], // 1 used, 0 fallback → coverage 1
        fallbackSlots: [],
      }),
      makeTracedSlide("s2", 1, {
        strategyId: "b",
        layoutKind: "content",
        layoutId: "content",
        usedSlots: ["title"], // 1 used, 1 fallback → coverage 0.5
        fallbackSlots: ["body"],
      }),
    ];

    const presentation = makePresentation(slides);
    const result = analyzeDeckLayout(presentation);

    // average = (1 + 0.5) / 2 = 0.75
    expect(result.summary.averageSlotCoverageRatio).toBeCloseTo(0.75, 2);
  });

  it("counts warnings and errors correctly", () => {
    const slides = [
      makeSlide({ id: "no-trace", index: 0, elements: [] }), // missing_template_trace → error
      makeTracedSlide("s2", 1, {
        strategyId: "test",
        layoutKind: "content",
        layoutId: "content",
        usedSlots: ["title"],
        fallbackSlots: ["a", "b", "c"], // too_many_fallback_slots → warning, slot_fallback → info (counted as warning)
      }),
    ];

    const presentation = makePresentation(slides);
    const result = analyzeDeckLayout(presentation);

    expect(result.summary.errorCount).toBeGreaterThan(0);
    expect(result.summary.warningsByCode.missing_template_trace).toBe(1);
    expect(result.summary.warningsByCode.too_many_fallback_slots).toBe(1);
  });
});

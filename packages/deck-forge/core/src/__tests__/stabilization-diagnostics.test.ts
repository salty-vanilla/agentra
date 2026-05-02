import { describe, expect, it } from "vitest";
import { analyzeDeckStabilization } from "#src/diagnostics/stabilization-diagnostics.js";
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

type OpLogEntry = PresentationIR["operationLog"][number];

function makeOpEntry(type: string, slideId?: string): OpLogEntry {
  return {
    id: `op-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    actor: "system",
    operation: { type, ...(slideId ? { slideId } : {}) },
    result: "success",
  } as OpLogEntry;
}

function makePresentation(
  slides: SlideIR[],
  operationLog: OpLogEntry[] = [],
): PresentationIR {
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
    operationLog,
  } as unknown as PresentationIR;
}

function makeTracedSlide(
  id: string,
  index: number,
  trace: Record<string, unknown>,
): SlideIR {
  return makeSlide({
    id,
    index,
    elements: [
      makeTextElement(`${id}-e1`, { x: 80, y: 56, width: 400, height: 72 }),
      makeTextElement(`${id}-e2`, { x: 80, y: 150, width: 400, height: 200 }),
    ],
    _trace: {
      templateProfileId: "executive-navy-v1",
      templateLayoutId: "content-standard",
      templateLayoutKind: "content",
      layoutStrategyId: "",
      layoutSpecType: "single_column",
      usedSlots: ["title", "body"],
      fallbackSlots: [],
      ...trace,
    } as unknown as SlideIR["_trace"],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeDeckStabilization", () => {
  describe("clean deck", () => {
    it("returns stable status with high score", () => {
      const slides = [
        makeTracedSlide("s1", 0, {
          templateLayoutId: "cover",
          templateLayoutKind: "cover",
          usedSlots: ["title", "subtitle"],
        }),
        makeTracedSlide("s2", 1, {
          layoutStrategyId: "executive-summary-kpi",
          templateLayoutId: "dashboard-cards",
          templateLayoutKind: "dashboard",
          usedSlots: ["title", "metrics", "callout"],
        }),
        makeTracedSlide("s3", 2, {
          layoutStrategyId: "data-insight-story",
          templateLayoutId: "visual-left-insight-right",
          templateLayoutKind: "visual-insight",
          usedSlots: ["title", "visual", "insight"],
        }),
      ];

      // Only a few operations (minimal repair)
      const ops = [
        makeOpEntry("update_style", "s2"),
        makeOpEntry("update_font", "s3"),
      ];

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, ops),
      });

      expect(result.status).toBe("stable");
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.layout.slideCount).toBe(3);
      expect(result.operations.totalOperations).toBe(2);
    });
  });

  describe("operation-heavy deck", () => {
    it("returns needs_attention or unstable for high operation count", () => {
      const slides = [
        makeTracedSlide("s1", 0, {}),
        makeTracedSlide("s2", 1, {}),
      ];

      // Many layout repair operations (>slideCount*12)
      const ops: OpLogEntry[] = [];
      for (let i = 0; i < 30; i++) {
        ops.push(makeOpEntry("set_element_frame", i % 2 === 0 ? "s1" : "s2"));
      }

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, ops),
      });

      expect(result.score).toBeLessThan(80);
      expect(["needs_attention", "unstable"]).toContain(result.status);
      expect(result.operations.layoutRepairRatio).toBeGreaterThan(0.5);

      const recCodes = result.recommendations.map((r) => r.code);
      expect(recCodes).toContain("reduce_layout_repair");
    });
  });

  describe("overlap/out-of-bounds deck", () => {
    it("returns unstable for out-of-bounds elements", () => {
      const slide = makeSlide({
        id: "s1",
        index: 0,
        elements: [
          // Out of bounds element
          makeTextElement("e1", { x: 1200, y: 600, width: 200, height: 200 }),
          makeTextElement("e2", { x: 80, y: 100, width: 400, height: 200 }),
        ],
        _trace: {
          templateProfileId: "executive-navy-v1",
          templateLayoutId: "content-standard",
          templateLayoutKind: "content",
          layoutStrategyId: "",
          layoutSpecType: "single_column",
          usedSlots: ["title", "body"],
          fallbackSlots: [],
        } as unknown as SlideIR["_trace"],
      });

      const result = analyzeDeckStabilization({
        presentation: makePresentation([slide]),
      });

      expect(result.status).toBe("unstable");
      expect(result.score).toBeLessThan(55);
      expect(result.layout.totalOutOfBoundsCount).toBeGreaterThan(0);
    });
  });

  describe("hotspot extraction", () => {
    it("identifies slide with most operations as hotspot", () => {
      const slides = [
        makeTracedSlide("s1", 0, {}),
        makeTracedSlide("s2", 1, {}),
        makeTracedSlide("s3", 2, {
          fallbackSlots: ["metrics", "cards"],
        }),
      ];

      const ops: OpLogEntry[] = [];
      // s3 gets most operations
      for (let i = 0; i < 12; i++) {
        ops.push(makeOpEntry("set_element_frame", "s3"));
      }
      // s1 gets a few
      for (let i = 0; i < 3; i++) {
        ops.push(makeOpEntry("update_style", "s1"));
      }

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, ops),
      });

      expect(result.hotspots.length).toBeGreaterThan(0);

      // s3 should be a hotspot with high operation count + fallback slots
      const s3Hotspot = result.hotspots.find((h) => h.slideId === "s3");
      expect(s3Hotspot).toBeDefined();
      expect(s3Hotspot!.operationCount).toBe(12);
      expect(s3Hotspot!.hasFallbackSlots).toBe(true);
      expect(s3Hotspot!.severity).toBe("error"); // >10 ops
    });

    it("hotspots sorted by severity then operation count", () => {
      const slides = [
        makeTracedSlide("s1", 0, {}),
        makeTracedSlide("s2", 1, { fallbackSlots: ["cards"] }),
      ];

      const ops: OpLogEntry[] = [];
      for (let i = 0; i < 15; i++) {
        ops.push(makeOpEntry("set_element_frame", "s1"));
      }
      for (let i = 0; i < 3; i++) {
        ops.push(makeOpEntry("update_style", "s2"));
      }

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, ops),
      });

      if (result.hotspots.length >= 2) {
        // s1 (error, 15 ops) should come before s2 (warning, 3 ops + fallback)
        expect(result.hotspots[0]!.slideId).toBe("s1");
      }
    });
  });

  describe("recommendations", () => {
    it("recommends ready_for_phase_8 for clean stable deck", () => {
      const slides = [
        makeTracedSlide("s1", 0, {
          templateLayoutId: "cover",
          templateLayoutKind: "cover",
        }),
        makeTracedSlide("s2", 1, {}),
      ];

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, []),
      });

      expect(result.status).toBe("stable");
      const recCodes = result.recommendations.map((r) => r.code);
      expect(recCodes).toContain("ready_for_phase_8");
    });

    it("recommends fix_template_slots when fallback slots exist", () => {
      const slides = [
        makeTracedSlide("s1", 0, {
          fallbackSlots: ["metrics"],
        }),
      ];

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, []),
      });

      const recCodes = result.recommendations.map((r) => r.code);
      expect(recCodes).toContain("fix_template_slots");
    });

    it("recommends improve_renderer_variant for high visual polish ratio", () => {
      const slides = [
        makeTracedSlide("s1", 0, {}),
      ];

      const ops: OpLogEntry[] = [];
      // 4 visual polish out of 10 = 40% > 30% threshold
      for (let i = 0; i < 4; i++) {
        ops.push(makeOpEntry("update_style", "s1"));
      }
      for (let i = 0; i < 6; i++) {
        ops.push(makeOpEntry("unknown_op", "s1"));
      }

      const result = analyzeDeckStabilization({
        presentation: makePresentation(slides, ops),
      });

      const recCodes = result.recommendations.map((r) => r.code);
      expect(recCodes).toContain("improve_renderer_variant");
    });
  });

  describe("score clamping", () => {
    it("score never goes below 0", () => {
      const slide = makeSlide({
        id: "s1",
        index: 0,
        elements: [
          makeTextElement("e1", { x: -100, y: -100, width: 200, height: 200 }),
        ],
        _trace: {
          templateProfileId: "executive-navy-v1",
          templateLayoutId: "content-standard",
          templateLayoutKind: "content",
          layoutStrategyId: "",
          layoutSpecType: "single_column",
          usedSlots: [],
          fallbackSlots: ["title", "body", "callout"],
        } as unknown as SlideIR["_trace"],
      });

      // Tons of layout repair operations
      const ops: OpLogEntry[] = [];
      for (let i = 0; i < 50; i++) {
        ops.push(makeOpEntry("set_element_frame", "s1"));
      }

      const result = analyzeDeckStabilization({
        presentation: makePresentation([slide], ops),
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});

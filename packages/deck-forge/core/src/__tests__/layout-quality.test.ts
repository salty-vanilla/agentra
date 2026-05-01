import { describe, expect, it } from "vitest";
import type {
  PresentationIR,
  SlideIR,
  TextElementIR,
  TableElementIR,
  ResolvedFrame,
} from "#src/index.js";
import { scoreLayoutQuality } from "#src/quality/score-layout-quality.js";
import {
  scoreWhitespaceBalance,
  scoreVisualHierarchy,
  scoreDensityComfort,
  scoreAlignmentConsistency,
  scoreEmphasisClarity,
} from "#src/quality/metric-scorers.js";
import {
  detectFlatVerticalComposition,
  detectExcessiveDensity,
  detectMissingHierarchy,
  detectLowUtilization,
  detectTinyFrames,
} from "#src/quality/warning-detectors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLIDE_SIZE = { width: 1280, height: 720, unit: "px" as const };

function makeSlide(overrides: Partial<SlideIR> & { elements: SlideIR["elements"] }): SlideIR {
  return {
    id: overrides.id ?? "slide-1",
    index: 0,
    title: overrides.title ?? "Test",
    layout: overrides.layout ?? {
      spec: { type: "single_column", density: "medium", emphasis: "top" },
      slideSize: SLIDE_SIZE,
      regions: [],
    },
    elements: overrides.elements,
  };
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
      id: "t",
      name: "Test",
      colors: {
        background: "#FFF",
        surface: "#F8F",
        textPrimary: "#000",
        textSecondary: "#666",
        primary: "#00F",
        secondary: "#0FF",
        accent: "#F00",
        chartPalette: ["#00F"],
      },
      typography: {
        fontFamily: { heading: "Arial", body: "Arial" },
        fontSize: { title: 36, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.8 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
      radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
      slideDefaults: { backgroundColor: "#FFF", padding: 24 },
      elementDefaults: { text: { fontFamily: "Arial", fontSize: 18, color: "#000" } },
    },
    slides,
    assets: { assets: [] },
    operationLog: [],
  };
}

function textEl(
  id: string,
  role: TextElementIR["role"],
  frame: ResolvedFrame,
  fontSize: number,
): TextElementIR {
  return {
    id,
    type: "text",
    role,
    text: { paragraphs: [{ runs: [{ text: "sample" }] }] },
    frame,
    style: { fontFamily: "Arial", fontSize, color: "#000" },
  };
}

function tableEl(
  id: string,
  frame: ResolvedFrame,
  cols: number,
  rows: number,
): TableElementIR {
  return {
    id,
    type: "table",
    frame,
    headers: Array.from({ length: cols }, (_, i) => `Col${i}`),
    rows: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "data"),
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("layout quality scoring", () => {
  // -----------------------------------------------------------------------
  // 1. Determinism
  // -----------------------------------------------------------------------
  it("returns stable scores for the same input", () => {
    const slide = makeSlide({
      elements: [
        textEl("t1", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
        textEl("b1", "body", { x: 80, y: 150, width: 1120, height: 400 }, 18),
      ],
    });
    const pres = makePresentation([slide]);

    const r1 = scoreLayoutQuality(pres);
    const r2 = scoreLayoutQuality(pres);

    expect(r1).toEqual(r2);
  });

  // -----------------------------------------------------------------------
  // 2. Dense slide scores lower than balanced
  // -----------------------------------------------------------------------
  it("dense slide scores lower than balanced slide", () => {
    const balanced = makeSlide({
      id: "balanced",
      elements: [
        textEl("t1", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
        textEl("b1", "body", { x: 80, y: 150, width: 1120, height: 350 }, 18),
        textEl("c1", "caption", { x: 80, y: 520, width: 1120, height: 50 }, 14),
      ],
    });

    const dense = makeSlide({
      id: "dense",
      elements: [
        textEl("t1", "title", { x: 80, y: 20, width: 1120, height: 40 }, 36),
        ...Array.from({ length: 12 }, (_, i) =>
          textEl(`e${i}`, "body", { x: 80, y: 70 + i * 50, width: 1120, height: 45 }, 16),
        ),
      ],
    });

    const balancedReport = scoreLayoutQuality(makePresentation([balanced]));
    const denseReport = scoreLayoutQuality(makePresentation([dense]));

    expect(balancedReport.slideScores[0]!.score).toBeGreaterThan(
      denseReport.slideScores[0]!.score,
    );
  });

  // -----------------------------------------------------------------------
  // 3. Hierarchy detection
  // -----------------------------------------------------------------------
  it("varied font sizes score higher on visualHierarchy than uniform", () => {
    const varied = makeSlide({
      elements: [
        textEl("t1", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
        textEl("b1", "body", { x: 80, y: 150, width: 1120, height: 300 }, 18),
        textEl("c1", "caption", { x: 80, y: 470, width: 1120, height: 40 }, 14),
      ],
    });

    const flat = makeSlide({
      elements: [
        textEl("t1", "title", { x: 80, y: 40, width: 1120, height: 80 }, 16),
        textEl("b1", "body", { x: 80, y: 150, width: 1120, height: 300 }, 16),
        textEl("c1", "caption", { x: 80, y: 470, width: 1120, height: 40 }, 16),
      ],
    });

    expect(scoreVisualHierarchy(varied)).toBeGreaterThan(scoreVisualHierarchy(flat));
  });

  // -----------------------------------------------------------------------
  // 4. Flat vertical composition warning
  // -----------------------------------------------------------------------
  it("detects flat-vertical-composition when all elements are stacked uniformly", () => {
    const slide = makeSlide({
      elements: [
        textEl("a", "body", { x: 100, y: 50, width: 1080, height: 100 }, 16),
        textEl("b", "body", { x: 100, y: 160, width: 1080, height: 100 }, 16),
        textEl("c", "body", { x: 100, y: 270, width: 1080, height: 100 }, 16),
        textEl("d", "body", { x: 100, y: 380, width: 1080, height: 100 }, 16),
      ],
    });

    const warnings = detectFlatVerticalComposition(slide);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.code).toBe("flat-vertical-composition");
  });

  it("does NOT fire flat-vertical-composition on a normal two-element slide", () => {
    const slide = makeSlide({
      elements: [
        textEl("t", "title", { x: 80, y: 40, width: 1120, height: 100 }, 36),
        textEl("b", "body", { x: 80, y: 160, width: 1120, height: 400 }, 18),
      ],
    });

    expect(detectFlatVerticalComposition(slide)).toHaveLength(0);
  });

  it("does NOT fire flat-vertical-composition when a focal element exists", () => {
    const slide = makeSlide({
      elements: [
        // Focal element: large hero image occupying > 30% of slide
        {
          id: "hero",
          type: "image" as const,
          assetId: "a",
          role: "hero" as const,
          frame: { x: 100, y: 50, width: 1080, height: 400 },
        },
        textEl("a", "body", { x: 100, y: 460, width: 1080, height: 60 }, 16),
        textEl("b", "body", { x: 100, y: 530, width: 1080, height: 60 }, 16),
        textEl("c", "caption", { x: 100, y: 600, width: 1080, height: 40 }, 14),
      ],
    });

    expect(detectFlatVerticalComposition(slide)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 5. Table density warning
  // -----------------------------------------------------------------------
  it("produces excessive-density warning for large tables", () => {
    const slide = makeSlide({
      elements: [
        tableEl("tbl", { x: 80, y: 80, width: 1120, height: 560 }, 8, 10),
      ],
    });

    const warnings = detectExcessiveDensity(slide);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.code === "excessive-density")).toBe(true);
  });

  it("does NOT warn on small tables", () => {
    const slide = makeSlide({
      elements: [
        tableEl("tbl", { x: 80, y: 80, width: 1120, height: 300 }, 3, 3),
      ],
    });

    expect(detectExcessiveDensity(slide)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 6. Low utilization warning
  // -----------------------------------------------------------------------
  it("produces low-utilization warning for tiny elements", () => {
    const slide = makeSlide({
      elements: [
        textEl("t1", "title", { x: 500, y: 300, width: 100, height: 30 }, 14),
      ],
    });

    const warnings = detectLowUtilization(slide);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.code).toBe("low-utilization");
  });

  // -----------------------------------------------------------------------
  // 7. Full report structure
  // -----------------------------------------------------------------------
  it("returns a valid LayoutQualityReport with summary statistics", () => {
    const slides = [
      makeSlide({
        id: "s1",
        elements: [
          textEl("t1", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
          textEl("b1", "body", { x: 80, y: 150, width: 1120, height: 350 }, 18),
        ],
      }),
      makeSlide({
        id: "s2",
        elements: [
          textEl("t2", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
          tableEl("tbl", { x: 80, y: 150, width: 1120, height: 450 }, 7, 9),
        ],
      }),
    ];
    const report = scoreLayoutQuality(makePresentation(slides));

    expect(report.slideScores).toHaveLength(2);
    expect(report.summary.averageScore).toBeGreaterThan(0);
    expect(report.summary.minScore).toBeLessThanOrEqual(report.summary.averageScore);
    expect(typeof report.summary.weakSlideCount).toBe("number");
    expect(typeof report.summary.flatVerticalCompositionCount).toBe("number");
    expect(report.summary.warningCountsByCode).toBeDefined();
    expect(typeof report.summary.warningCountsByCode["excessive-density"]).toBe("number");
    expect(typeof report.summary.warningCountsByCode["flat-vertical-composition"]).toBe("number");

    // Each slide has all 6 metrics
    for (const ss of report.slideScores) {
      expect(ss.metrics).toHaveProperty("whitespaceBalance");
      expect(ss.metrics).toHaveProperty("visualHierarchy");
      expect(ss.metrics).toHaveProperty("regionUtilization");
      expect(ss.metrics).toHaveProperty("alignmentConsistency");
      expect(ss.metrics).toHaveProperty("densityComfort");
      expect(ss.metrics).toHaveProperty("emphasisClarity");
      expect(ss.score).toBeGreaterThanOrEqual(0);
      expect(ss.score).toBeLessThanOrEqual(1);
    }
  });

  // -----------------------------------------------------------------------
  // 8. Missing hierarchy detection
  // -----------------------------------------------------------------------
  it("detects missing-hierarchy when all text is same size", () => {
    const slide = makeSlide({
      elements: [
        textEl("a", "title", { x: 80, y: 40, width: 1120, height: 80 }, 18),
        textEl("b", "body", { x: 80, y: 150, width: 1120, height: 300 }, 18),
      ],
    });

    const warnings = detectMissingHierarchy(slide);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.code).toBe("missing-hierarchy");
  });

  // -----------------------------------------------------------------------
  // 9. Tiny frame detection
  // -----------------------------------------------------------------------
  it("detects tiny frames", () => {
    const slide = makeSlide({
      elements: [
        textEl("big", "title", { x: 80, y: 40, width: 1120, height: 400 }, 36),
        textEl("tiny", "caption", { x: 600, y: 500, width: 20, height: 10 }, 10),
      ],
    });

    const warnings = detectTinyFrames(slide);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.elementId).toBe("tiny");
  });

  // -----------------------------------------------------------------------
  // 10. Warning severity levels
  // -----------------------------------------------------------------------
  it("assigns severity to warnings", () => {
    // Critical: large table
    const slide = makeSlide({
      elements: [tableEl("big", { x: 80, y: 80, width: 1120, height: 560 }, 8, 10)],
    });
    const warnings = detectExcessiveDensity(slide);
    expect(warnings.some((w) => w.severity === "critical")).toBe(true);

    // Info: missing hierarchy (no title)
    const noTitle = makeSlide({
      elements: [
        textEl("a", "body", { x: 80, y: 40, width: 1120, height: 200 }, 18),
        textEl("b", "body", { x: 80, y: 260, width: 1120, height: 200 }, 18),
      ],
    });
    const hierWarnings = detectMissingHierarchy(noTitle);
    expect(hierWarnings.some((w) => w.severity === "info")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 11. Alignment scoring
  // -----------------------------------------------------------------------
  it("aligned elements score higher than misaligned", () => {
    const aligned = makeSlide({
      elements: [
        textEl("a", "title", { x: 80, y: 40, width: 1120, height: 80 }, 36),
        textEl("b", "body", { x: 80, y: 150, width: 1120, height: 300 }, 18),
      ],
    });

    const misaligned = makeSlide({
      elements: [
        textEl("a", "title", { x: 80, y: 40, width: 500, height: 80 }, 36),
        textEl("b", "body", { x: 300, y: 250, width: 700, height: 300 }, 18),
      ],
    });

    expect(scoreAlignmentConsistency(aligned)).toBeGreaterThanOrEqual(
      scoreAlignmentConsistency(misaligned),
    );
  });
});

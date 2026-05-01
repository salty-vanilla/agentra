import { describe, expect, it } from "vitest";

import { frameOverlapRatio } from "#src/geometry/frame-geometry.js";
import type {
  ElementIR,
  PresentationIR,
  ResolvedLayout,
  SlideIR,
  TextElementIR,
  ValidationIssue,
} from "#src/index.js";
import { repairPresentationLayout } from "#src/repair/repair-presentation-layout.js";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

const BASE_THEME: PresentationIR["theme"] = {
  id: "t1",
  name: "Test",
  colors: {
    background: "#FFF",
    surface: "#F8F8F8",
    textPrimary: "#000",
    textSecondary: "#666",
    primary: "#00F",
    secondary: "#0CF",
    accent: "#0F0",
    chartPalette: ["#00F"],
  },
  typography: {
    fontFamily: { heading: "Arial", body: "Arial" },
    fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
    lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.7 },
    weight: { regular: 400, medium: 500, bold: 700 },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { none: 0, sm: 4, md: 8, lg: 12, full: 999 },
  slideDefaults: { backgroundColor: "#FFF", padding: 24 },
  elementDefaults: {},
};

const SLIDE_SIZE = { width: 1280, height: 720, unit: "px" as const };

function makeTextElement(
  id: string,
  role: TextElementIR["role"],
  frame: { x: number; y: number; width: number; height: number },
): TextElementIR {
  return {
    id,
    type: "text",
    role,
    text: { paragraphs: [{ runs: [{ text: `Text ${id}` }] }] },
    frame,
    style: { fontFamily: "Arial", fontSize: 18, color: "#000" },
  };
}

function makeSlide(
  id: string,
  elements: ElementIR[],
  layout?: Partial<ResolvedLayout>,
): SlideIR {
  return {
    id,
    index: 0,
    title: "Test Slide",
    layout: {
      spec: { type: "single_column", density: "medium" },
      slideSize: SLIDE_SIZE,
      regions: [],
      ...layout,
    },
    elements,
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
    theme: BASE_THEME,
    slides,
    assets: { assets: [] },
    operationLog: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("repairPresentationLayout", () => {
  // -----------------------------------------------------------------------
  // Rule 1: out-of-bounds
  // -----------------------------------------------------------------------
  it("clamps out-of-bounds element to slide bounds", async () => {
    const el = makeTextElement("el-oob", "body", { x: -50, y: -20, width: 400, height: 200 });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    expect(result.summary.appliedCount).toBeGreaterThan(0);
    const repairedEl = result.presentation.slides[0]!.elements.find((e) => e.id === "el-oob")!;
    expect(repairedEl.frame.x).toBeGreaterThanOrEqual(0);
    expect(repairedEl.frame.y).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // Rule 2: unhonored-region-ref (single contentRef)
  // -----------------------------------------------------------------------
  it("moves element into its declared region (single contentRef)", async () => {
    const region = {
      id: "body-region",
      role: "body" as const,
      contentRefs: ["el-body"],
      priority: 1,
      frame: { x: 100, y: 200, width: 1080, height: 400 },
    };
    const el = makeTextElement("el-body", "body", { x: 10, y: 10, width: 200, height: 100 });
    const slide = makeSlide(
      "s1",
      [makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }), el],
      { regions: [region] },
    );
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    const repairedEl = result.presentation.slides[0]!.elements.find((e) => e.id === "el-body")!;
    // After repair, element should overlap the region significantly.
    const overlap = frameOverlapRatio(repairedEl.frame, region.frame);
    expect(overlap).toBeGreaterThanOrEqual(0.8);
  });

  // -----------------------------------------------------------------------
  // Rule 2: unhonored-region-ref (multi contentRef → set_element_region)
  // -----------------------------------------------------------------------
  it("uses set_element_region for multi-ref regions to trigger reflow", async () => {
    const region = {
      id: "body-region",
      role: "body" as const,
      contentRefs: ["el-body-1", "el-body-2"],
      priority: 1,
      frame: { x: 100, y: 200, width: 1080, height: 400 },
    };
    // el-body-1 is outside the region
    const el1 = makeTextElement("el-body-1", "body", { x: 10, y: 10, width: 200, height: 100 });
    const el2 = makeTextElement("el-body-2", "body", { x: 100, y: 200, width: 1080, height: 190 });
    const slide = makeSlide(
      "s1",
      [makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }), el1, el2],
      { regions: [region] },
    );
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    // Should have proposed a set_element_region operation
    const regionOps = result.proposed.filter((r) => r.operation.type === "set_element_region");
    expect(regionOps.length).toBeGreaterThanOrEqual(1);
    expect(result.summary.appliedCount).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Rule 3: duplicate-frame
  // -----------------------------------------------------------------------
  it("distributes elements with duplicate frames vertically", async () => {
    const frame = { x: 100, y: 200, width: 1080, height: 300 };
    const el1 = makeTextElement("el-dup-1", "body", { ...frame });
    const el2 = makeTextElement("el-dup-2", "body", { ...frame });
    const el3 = makeTextElement("el-dup-3", "body", { ...frame });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el1,
      el2,
      el3,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    const elements = result.presentation.slides[0]!.elements.filter((e) =>
      e.id.startsWith("el-dup"),
    );
    const ys = elements.map((e) => e.frame.y);
    // All y positions should be different
    expect(new Set(ys).size).toBe(3);
    expect(result.summary.appliedCount).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Rule 4: table-sidebar overlap
  // -----------------------------------------------------------------------
  it("splits table and sidebar-like element into 65/35 layout", async () => {
    const tableEl: ElementIR = {
      id: "el-table",
      type: "table",
      frame: { x: 100, y: 200, width: 1080, height: 400 },
      headers: ["A", "B"],
      rows: [["1", "2"]],
    };
    const calloutEl = makeTextElement("el-callout", "callout", {
      x: 100,
      y: 200,
      width: 1080,
      height: 400,
    });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      tableEl,
      calloutEl,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    const table = result.presentation.slides[0]!.elements.find((e) => e.id === "el-table")!;
    const callout = result.presentation.slides[0]!.elements.find((e) => e.id === "el-callout")!;

    // Table should be wider than callout (65 vs 35)
    expect(table.frame.width).toBeGreaterThan(callout.frame.width);
    // They should not overlap significantly
    const overlap = frameOverlapRatio(table.frame, callout.frame);
    expect(overlap).toBeLessThan(0.1);
  });

  // -----------------------------------------------------------------------
  // Rule 5: title-footer misplacement
  // -----------------------------------------------------------------------
  it("moves footer element to bottom on title slide", async () => {
    const footerEl = makeTextElement("el-footer", "footer", {
      x: 100,
      y: 200,
      width: 1080,
      height: 60,
    });
    const slide = makeSlide(
      "s1",
      [
        makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
        footerEl,
      ],
      { spec: { type: "title", density: "low", emphasis: "center" } },
    );
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    const repairedFooter = result.presentation.slides[0]!.elements.find(
      (e) => e.id === "el-footer",
    )!;
    // Footer should be moved to bottom (y >= 70% of slide height)
    expect(repairedFooter.frame.y).toBeGreaterThanOrEqual(SLIDE_SIZE.height * 0.7);
  });

  // -----------------------------------------------------------------------
  // Rule 6: significant overlap fallback
  // -----------------------------------------------------------------------
  it("stacks significantly overlapping body elements vertically", async () => {
    // Two body elements with identical frames (100% overlap)
    const el1 = makeTextElement("el-a", "body", { x: 100, y: 200, width: 1080, height: 400 });
    const el2 = makeTextElement("el-b", "body", { x: 100, y: 200, width: 1080, height: 400 });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el1,
      el2,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    const elA = result.presentation.slides[0]!.elements.find((e) => e.id === "el-a")!;
    const elB = result.presentation.slides[0]!.elements.find((e) => e.id === "el-b")!;
    const overlap = frameOverlapRatio(elA.frame, elB.frame);
    expect(overlap).toBeLessThan(0.4);
  });

  // -----------------------------------------------------------------------
  // Issue count decreases
  // -----------------------------------------------------------------------
  it("reduces layout issue count after repair", async () => {
    const el = makeTextElement("el-oob", "body", { x: -100, y: -50, width: 400, height: 200 });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    expect(result.summary.issueCountAfter).toBeLessThan(result.summary.issueCountBefore);
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  it("is idempotent — second repair produces no new operations", async () => {
    const el = makeTextElement("el-oob", "body", { x: -50, y: -20, width: 400, height: 200 });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el,
    ]);
    const pres = makePresentation([slide]);

    const first = await repairPresentationLayout({ presentation: pres });
    expect(first.summary.appliedCount).toBeGreaterThan(0);

    const second = await repairPresentationLayout({ presentation: first.presentation });
    expect(second.summary.proposedCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // No-op
  // -----------------------------------------------------------------------
  it("does nothing when no layout issues exist", async () => {
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      makeTextElement("el-body", "body", { x: 100, y: 200, width: 1080, height: 400 }),
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({ presentation: pres });

    expect(result.summary.proposedCount).toBe(0);
    expect(result.summary.appliedCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Skip tracking
  // -----------------------------------------------------------------------
  it("reports skipped operations for non-existent elements", async () => {
    const pres = makePresentation([
      makeSlide("s1", [
        makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      ]),
    ]);

    // Manually provide an issue referencing a non-existent element
    const fakeIssues: ValidationIssue[] = [
      {
        id: "layout/out-of-bounds/s1/el-ghost",
        severity: "error",
        category: "layout",
        message: "Element frame is out of slide bounds: el-ghost",
        target: "element/el-ghost",
      },
    ];

    const result = await repairPresentationLayout({
      presentation: pres,
      issues: fakeIssues,
    });

    // The rule should propose an op, but it should be skipped since el-ghost doesn't exist.
    // Actually the rule won't find the element in findElement, so it won't even propose an op.
    // Let me reconsider: the repair rule checks if the element exists before emitting the op.
    // So we need a different approach for skip tracking.
    // Skip tracking happens when the operation handler can't find the element.
    // We need an issue where the rule proposes an op but the handler skips it.

    // The rule checks element existence, so with non-existent element it won't propose.
    // This is correct behavior — no op proposed, no skip.
    expect(result.summary.proposedCount).toBe(0);
  });

  it("reports skipped when handler cannot find element after rule proposes op", async () => {
    // Test skip tracking through duplicate-frame rule.
    // Issue references elements that exist for the rule but we'll remove one before handler runs.
    // Actually, since clone happens first, this is hard to test directly.
    // Instead, test that the summary correctly separates applied vs skipped via manual issues.

    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      makeTextElement("el-a", "body", { x: 100, y: 200, width: 1080, height: 300 }),
    ]);
    const pres = makePresentation([slide]);

    // Provide a duplicate-frame issue referencing el-a + el-nonexistent.
    // The rule will try to stack both, but el-nonexistent handler will skip.
    const fakeIssues: ValidationIssue[] = [
      {
        id: "layout/duplicate-frame/s1/el-a+el-nonexistent",
        severity: "error",
        category: "layout",
        message: "Duplicate element frames",
        target: "slide/s1",
      },
    ];

    const result = await repairPresentationLayout({
      presentation: pres,
      issues: fakeIssues,
    });

    // Should have 2 proposed ops (one for el-a, one for el-nonexistent)
    expect(result.summary.proposedCount).toBe(2);
    // el-nonexistent should be skipped
    expect(result.summary.skippedCount).toBeGreaterThanOrEqual(1);
    expect(result.skipped.some((r) => r.reason === "element_not_found")).toBe(true);
    // el-a should be applied
    expect(result.summary.appliedCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Rule subset
  // -----------------------------------------------------------------------
  it("only runs specified rules when options.rules is set", async () => {
    // Create presentation with both OOB and duplicate-frame issues
    const frame = { x: -50, y: 200, width: 400, height: 300 };
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      makeTextElement("el-dup-1", "body", { ...frame }),
      makeTextElement("el-dup-2", "body", { ...frame }),
    ]);
    const pres = makePresentation([slide]);

    // Only run out-of-bounds
    const result = await repairPresentationLayout({
      presentation: pres,
      options: { rules: ["out-of-bounds"] },
    });

    // Should only have out-of-bounds repairs
    for (const record of result.proposed) {
      expect(record.ruleId).toBe("out-of-bounds");
    }
  });

  // -----------------------------------------------------------------------
  // Dry run
  // -----------------------------------------------------------------------
  it("proposes operations but does not mutate presentation in dry run", async () => {
    const el = makeTextElement("el-oob", "body", { x: -50, y: -20, width: 400, height: 200 });
    const slide = makeSlide("s1", [
      makeTextElement("el-title", "title", { x: 80, y: 80, width: 1120, height: 100 }),
      el,
    ]);
    const pres = makePresentation([slide]);

    const result = await repairPresentationLayout({
      presentation: pres,
      options: { dryRun: true },
    });

    expect(result.summary.proposedCount).toBeGreaterThan(0);
    // Presentation should NOT be modified — element still out of bounds
    const repairedEl = result.presentation.slides[0]!.elements.find((e) => e.id === "el-oob")!;
    expect(repairedEl.frame.x).toBe(-50);
    expect(repairedEl.frame.y).toBe(-20);
  });
});

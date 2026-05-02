import { describe, expect, it } from "vitest";
import { repairTextOverflow } from "#src/repair/text-overflow-repair.js";
import type { PresentationIR, TextElementIR, TableElementIR, RichText, SlideIntent } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePresentation(
  elements: Array<TextElementIR | TableElementIR>,
): PresentationIR {
  return {
    id: "deck-test",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      author: "test",
    },
    theme: {
      id: "theme-test",
      name: "Test",
      colors: {
        background: "#FFFFFF",
        surface: "#F8FAFC",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        primary: "#1D4ED8",
        secondary: "#0EA5E9",
        accent: "#14B8A6",
        chartPalette: ["#1D4ED8"],
      },
      typography: {
        fontFamily: { heading: "Arial", body: "Arial", mono: "Courier" },
        fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.2, normal: 1.4, relaxed: 1.6 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
      radius: { none: 0, sm: 2, md: 4, lg: 8, full: 9999 },
      slideDefaults: {},
      elementDefaults: {},
    },
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Test Slide",
        intent: {
          keyMessage: "Test",
          audienceTakeaway: "Test",
          intent: "summarize",
          contentKinds: ["summary"],
        } satisfies SlideIntent,
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [],
        },
        elements,
      },
    ],
    assets: { assets: [] },
    operationLog: [],
  };
}

function makeRichText(text: string): RichText {
  return { paragraphs: [{ runs: [{ text }] }] };
}

function makeOverflowingTextElement(): TextElementIR {
  return {
    id: "el-overflow",
    type: "text",
    role: "body",
    text: makeRichText("This is a moderately long paragraph. ".repeat(20)),
    frame: { x: 80, y: 80, width: 400, height: 50 },
    style: { fontSize: 18 },
  };
}

function makeOverflowingTitleElement(): TextElementIR {
  return {
    id: "el-title-overflow",
    type: "text",
    role: "title",
    text: makeRichText("A".repeat(200)),
    frame: { x: 80, y: 80, width: 300, height: 40 },
    style: { fontSize: 36 },
  };
}

function makeClippedTableElement(): TableElementIR {
  const rows = Array.from({ length: 15 }, (_, i) => [`Row ${i}`, `Val ${i}`]);
  return {
    id: "el-table",
    type: "table",
    frame: { x: 80, y: 80, width: 1120, height: 100 },
    headers: ["Name", "Value"],
    rows,
    style: {
      headerFill: "#1D4ED8",
      borderColor: "#CBD5E1",
      textStyle: { fontSize: 14, fontFamily: "Arial" },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("repairTextOverflow", () => {
  it("reduces font size for overflowing text element", async () => {
    const pres = makePresentation([makeOverflowingTextElement()]);
    const result = await repairTextOverflow({ presentation: pres });

    expect(result.summary.appliedCount).toBeGreaterThan(0);
    expect(result.applied.length).toBeGreaterThan(0);

    const action = result.applied.find((a) => a.elementId === "el-overflow");
    expect(action).toBeDefined();
    expect(action!.action).toBe("reduce_font_size");
    expect(action!.to).toBeLessThan(action!.from);

    // Verify element was actually modified in the returned presentation
    const el = result.presentation.slides[0]!.elements.find(
      (e) => e.id === "el-overflow",
    ) as TextElementIR;
    expect(el.style.fontSize).toBe(action!.to);
  });

  it("does not reduce font size below minFontSize", async () => {
    const pres = makePresentation([makeOverflowingTextElement()]);

    // Set a high minFontSize
    const result = await repairTextOverflow({
      presentation: pres,
      options: { minFontSize: 16 },
    });

    for (const action of result.applied) {
      expect(action.to).toBeGreaterThanOrEqual(16);
    }
  });

  it("uses min 18 for title elements", async () => {
    const pres = makePresentation([makeOverflowingTitleElement()]);
    const result = await repairTextOverflow({ presentation: pres });

    const action = result.applied.find((a) => a.elementId === "el-title-overflow");
    if (action) {
      expect(action.to).toBeGreaterThanOrEqual(18);
    }
  });

  it("reduces table font size for clipped table", async () => {
    const pres = makePresentation([makeClippedTableElement()]);
    const result = await repairTextOverflow({ presentation: pres });

    const action = result.applied.find((a) => a.elementId === "el-table");
    expect(action).toBeDefined();
    expect(action!.action).toBe("reduce_table_font_size");
    expect(action!.to).toBeLessThan(action!.from);

    // Verify element was actually modified
    const el = result.presentation.slides[0]!.elements.find(
      (e) => e.id === "el-table",
    ) as TableElementIR;
    expect(el.style?.textStyle?.fontSize).toBe(action!.to);
  });

  it("preserves nested table style fields during repair", async () => {
    const pres = makePresentation([makeClippedTableElement()]);
    const result = await repairTextOverflow({ presentation: pres });

    const el = result.presentation.slides[0]!.elements.find(
      (e) => e.id === "el-table",
    ) as TableElementIR;

    // headerFill, borderColor, and fontFamily should be preserved
    expect(el.style?.headerFill).toBe("#1D4ED8");
    expect(el.style?.borderColor).toBe("#CBD5E1");
    expect(el.style?.textStyle?.fontFamily).toBe("Arial");
  });

  it("reduces issue count after repair", async () => {
    const pres = makePresentation([makeOverflowingTextElement()]);
    const result = await repairTextOverflow({ presentation: pres });

    expect(result.summary.issueCountAfter).toBeLessThanOrEqual(
      result.summary.issueCountBefore,
    );
  });

  it("is idempotent when no applicable issues remain", async () => {
    // First repair pass
    const pres = makePresentation([
      {
        id: "el-ok",
        type: "text",
        role: "body",
        text: makeRichText("Short text"),
        frame: { x: 80, y: 80, width: 1120, height: 200 },
        style: { fontSize: 18 },
      },
    ]);

    const result = await repairTextOverflow({ presentation: pres });

    expect(result.summary.proposedCount).toBe(0);
    expect(result.summary.appliedCount).toBe(0);
  });

  it("proposes but does not apply changes in dryRun mode", async () => {
    const pres = makePresentation([makeOverflowingTextElement()]);
    const result = await repairTextOverflow({
      presentation: pres,
      options: { dryRun: true },
    });

    expect(result.summary.proposedCount).toBeGreaterThan(0);
    expect(result.summary.appliedCount).toBe(0);

    // Element should NOT be modified in dryRun
    const el = result.presentation.slides[0]!.elements.find(
      (e) => e.id === "el-overflow",
    ) as TextElementIR;
    expect(el.style.fontSize).toBe(18); // unchanged
  });
});

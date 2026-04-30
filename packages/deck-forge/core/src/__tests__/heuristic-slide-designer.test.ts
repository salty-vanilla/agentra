import { describe, expect, it } from "vitest";

import { HeuristicSlideDesigner } from "#src/design/heuristic-slide-designer.js";
import type { PresentationIR, RichText, SlideIR, TextElementIR, ThemeSpec } from "#src/index.js";
import type { UpdateTextOperation } from "#src/operations/types.js";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeTheme(): ThemeSpec {
  return {
    id: "theme-1",
    name: "Test Theme",
    colors: {
      background: "#ffffff",
      surface: "#f5f5f5",
      textPrimary: "#111111",
      textSecondary: "#555555",
      primary: "#2563eb",
      secondary: "#9ca3af",
      accent: "#f97316",
      chartPalette: ["#2563eb", "#f97316"],
    },
    typography: {
      fontFamily: { heading: "Inter", body: "Inter" },
      fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
      lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
      weight: { regular: 400, medium: 500, bold: 700 },
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as ThemeSpec["spacing"],
    radius: { sm: 4, md: 8, lg: 12 } as ThemeSpec["radius"],
    slideDefaults: {} as ThemeSpec["slideDefaults"],
    elementDefaults: {} as ThemeSpec["elementDefaults"],
  } as ThemeSpec;
}

function plain(text: string): RichText {
  return { paragraphs: [{ runs: [{ text }] }] };
}

function makeTextElement(
  id: string,
  role: TextElementIR["role"],
  text: RichText,
  fontSize?: number,
): TextElementIR {
  return {
    id,
    type: "text",
    role,
    text,
    frame: { x: 0, y: 0, width: 100, height: 50 },
    style: { fontSize: fontSize ?? 18 },
  };
}

function makeSlide(elements: TextElementIR[]): SlideIR {
  return {
    id: "slide-1",
    index: 0,
    layout: { type: "single_column", regions: [] } as unknown as SlideIR["layout"],
    elements,
  } as SlideIR;
}

function makePresentation(slides: SlideIR[], theme: ThemeSpec): PresentationIR {
  return {
    id: "deck-1",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    theme,
    slides,
    assets: { assets: [] },
    operationLog: [],
  } as PresentationIR;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("HeuristicSlideDesigner", () => {
  it("enlarges short titles", async () => {
    const theme = makeTheme();
    const title = makeTextElement("t1", "title", plain("Short and punchy"), 40);
    const slide = makeSlide([title]);
    const presentation = makePresentation([slide], theme);

    const designer = new HeuristicSlideDesigner();
    const result = await designer.designSlide({ slide, presentation, theme });

    const titleOps = result.operations.filter(
      (op): op is UpdateTextOperation => op.type === "update_text" && op.elementId === "t1",
    );
    expect(titleOps).toHaveLength(1);
    expect(titleOps[0]?.style?.fontSize).toBe(46); // round(40 * 1.15)
  });

  it("shrinks long titles", async () => {
    const theme = makeTheme();
    const long = "A".repeat(120);
    const title = makeTextElement("t1", "title", plain(long), 40);
    const slide = makeSlide([title]);
    const presentation = makePresentation([slide], theme);

    const result = await new HeuristicSlideDesigner().designSlide({
      slide,
      presentation,
      theme,
    });
    const op = result.operations.find(
      (o): o is UpdateTextOperation => o.type === "update_text" && o.elementId === "t1",
    );
    expect(op?.style?.fontSize).toBe(34); // round(40 * 0.85)
  });

  it("does not change titles in the middle range", async () => {
    const theme = makeTheme();
    const title = makeTextElement(
      "t1",
      "title",
      plain("This title length sits comfortably in the middle range above 48"),
      40,
    );
    const slide = makeSlide([title]);
    const presentation = makePresentation([slide], theme);

    const result = await new HeuristicSlideDesigner().designSlide({
      slide,
      presentation,
      theme,
    });
    const titleOps = result.operations.filter(
      (op): op is UpdateTextOperation => op.type === "update_text" && op.elementId === "t1",
    );
    expect(titleOps).toHaveLength(0);
  });

  it("shrinks dense callouts", async () => {
    const theme = makeTheme();
    const dense = "B".repeat(220);
    const callout = makeTextElement("c1", "callout", plain(dense), 20);
    const slide = makeSlide([callout]);
    const presentation = makePresentation([slide], theme);

    const result = await new HeuristicSlideDesigner().designSlide({
      slide,
      presentation,
      theme,
    });
    const op = result.operations.find(
      (o): o is UpdateTextOperation => o.type === "update_text" && o.elementId === "c1",
    );
    expect(op?.style?.fontSize).toBe(15); // round(18 * 0.85), baseline = theme.body
  });

  it("applies accent color to bold bullet runs", async () => {
    const theme = makeTheme();
    const bulletText: RichText = {
      paragraphs: [
        {
          runs: [{ text: "Plain bullet", style: { bold: false } }],
          bullet: { indentLevel: 0 },
        },
        {
          runs: [{ text: "Important bullet", style: { bold: true } }],
          bullet: { indentLevel: 0 },
        },
      ],
    };
    const body = makeTextElement("b1", "body", bulletText, 18);
    const slide = makeSlide([body]);
    const presentation = makePresentation([slide], theme);

    const result = await new HeuristicSlideDesigner().designSlide({
      slide,
      presentation,
      theme,
    });
    const op = result.operations.find(
      (o): o is UpdateTextOperation => o.type === "update_text" && o.elementId === "b1",
    );
    expect(op).toBeDefined();
    if (!op || typeof op.text === "string") return;
    const runs = op.text.paragraphs[1]?.runs;
    expect(runs?.[0]?.style?.color).toBe(theme.colors.accent);
    // The non-emphasized run should still have no color.
    expect(op.text.paragraphs[0]?.runs[0]?.style?.color).toBeUndefined();
  });

  it("is idempotent: re-running on its own output yields zero operations", async () => {
    const theme = makeTheme();
    const bulletText: RichText = {
      paragraphs: [
        { runs: [{ text: "Important", style: { bold: true } }], bullet: { indentLevel: 0 } },
      ],
    };
    const body = makeTextElement("b1", "body", bulletText, 18);
    const title = makeTextElement("t1", "title", plain("Tiny"), 40);
    const slide = makeSlide([title, body]);
    const presentation = makePresentation([slide], theme);

    const designer = new HeuristicSlideDesigner();
    const first = await designer.designSlide({ slide, presentation, theme });
    expect(first.operations.length).toBeGreaterThan(0);

    // Apply the changes inline and re-run.
    const updatedTitle: TextElementIR = {
      ...title,
      style: { ...title.style, fontSize: 46 },
    };
    const updatedBody: TextElementIR = {
      ...body,
      text: {
        paragraphs: [
          {
            runs: [{ text: "Important", style: { bold: true, color: theme.colors.accent } }],
            bullet: { indentLevel: 0 },
          },
        ],
      },
    };
    const slide2 = makeSlide([updatedTitle, updatedBody]);
    const presentation2 = makePresentation([slide2], theme);
    const second = await designer.designSlide({
      slide: slide2,
      presentation: presentation2,
      theme,
    });
    expect(second.operations).toHaveLength(0);
  });

  it("respects focus filter — typography-only skips hierarchy operations", async () => {
    const theme = makeTheme();
    const bulletText: RichText = {
      paragraphs: [
        { runs: [{ text: "Important", style: { bold: true } }], bullet: { indentLevel: 0 } },
      ],
    };
    const body = makeTextElement("b1", "body", bulletText, 18);
    const slide = makeSlide([body]);
    const presentation = makePresentation([slide], theme);

    const result = await new HeuristicSlideDesigner().designSlide({
      slide,
      presentation,
      theme,
      options: { focus: ["typography"] },
    });
    expect(result.operations).toHaveLength(0);
  });
});

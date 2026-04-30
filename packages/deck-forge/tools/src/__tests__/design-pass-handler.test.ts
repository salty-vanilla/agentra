import { HeuristicSlideDesigner } from "@deck-forge/core";
import type { PresentationIR, SlideDesigner } from "@deck-forge/core";
import { describe, expect, it } from "vitest";

import { designPassHandler, getSlideDesigner, setSlideDesigner } from "#src/index.js";

function makePresentation(): PresentationIR {
  return {
    id: "deck-1",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    theme: {
      id: "theme-1",
      name: "T",
      colors: {
        background: "#fff",
        surface: "#f5f5f5",
        textPrimary: "#111",
        textSecondary: "#555",
        primary: "#2563eb",
        secondary: "#aaa",
        accent: "#f97316",
        chartPalette: ["#2563eb"],
      },
      typography: {
        fontFamily: { heading: "Inter", body: "Inter" },
        fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
      radius: { sm: 4, md: 8, lg: 12 },
      slideDefaults: {},
      elementDefaults: {},
    } as PresentationIR["theme"],
    slides: [
      {
        id: "slide-1",
        index: 0,
        layout: {
          type: "single_column",
          regions: [],
        } as unknown as PresentationIR["slides"][number]["layout"],
        elements: [
          {
            id: "t1",
            type: "text",
            role: "title",
            text: { paragraphs: [{ runs: [{ text: "Short title" }] }] },
            frame: { x: 0, y: 0, width: 100, height: 50 },
            style: { fontSize: 40 },
          },
        ],
      },
    ],
    assets: { assets: [] },
    operationLog: [],
  } as PresentationIR;
}

describe("designPassHandler", () => {
  it("throws when no designer is configured", async () => {
    setSlideDesigner(undefined);
    await expect(designPassHandler({ presentation: makePresentation() })).rejects.toThrow(
      "DESIGNER_ERROR",
    );
  });

  it("uses a per-call designer override when provided", async () => {
    setSlideDesigner(undefined);
    const result = await designPassHandler({
      presentation: makePresentation(),
      designer: new HeuristicSlideDesigner(),
    });
    expect(result.operations.length).toBeGreaterThan(0);
    expect(result.rationales).toHaveLength(1);
    expect(result.rationales[0]?.slideId).toBe("slide-1");
  });

  it("uses the registered designer when no override is provided", async () => {
    setSlideDesigner(new HeuristicSlideDesigner());
    expect(getSlideDesigner()).toBeDefined();
    const result = await designPassHandler({ presentation: makePresentation() });
    expect(result.operations.length).toBeGreaterThan(0);
    setSlideDesigner(undefined);
  });

  it("scopes the pass to a single slide when slideId is set", async () => {
    const presentation = makePresentation();
    // Add a second slide.
    presentation.slides.push({
      id: "slide-2",
      index: 1,
      layout: {
        type: "single_column",
        regions: [],
      } as unknown as PresentationIR["slides"][number]["layout"],
      elements: [
        {
          id: "t2",
          type: "text",
          role: "title",
          text: { paragraphs: [{ runs: [{ text: "Another short title" }] }] },
          frame: { x: 0, y: 0, width: 100, height: 50 },
          style: { fontSize: 40 },
        },
      ],
    } as PresentationIR["slides"][number]);

    const result = await designPassHandler({
      presentation,
      slideId: "slide-2",
      designer: new HeuristicSlideDesigner(),
    });
    expect(result.rationales).toHaveLength(1);
    expect(result.rationales[0]?.slideId).toBe("slide-2");
  });

  it("throws when the targeted slideId is not present", async () => {
    await expect(
      designPassHandler({
        presentation: makePresentation(),
        slideId: "missing",
        designer: new HeuristicSlideDesigner(),
      }),
    ).rejects.toThrow("DESIGNER_ERROR");
  });

  it("returns a presentation that already has the operations applied", async () => {
    const before = makePresentation();
    const beforeFontSize = (before.slides[0]?.elements[0] as { style: { fontSize: number } }).style
      .fontSize;
    const result = await designPassHandler({
      presentation: before,
      designer: new HeuristicSlideDesigner(),
    });
    const afterFontSize = (
      result.presentation.slides[0]?.elements[0] as {
        style: { fontSize: number };
      }
    ).style.fontSize;
    expect(afterFontSize).not.toBe(beforeFontSize);
    expect(afterFontSize).toBe(46); // round(40 * 1.15)
  });

  it("is callable with a custom mock designer", async () => {
    const calls: string[] = [];
    const mock: SlideDesigner = {
      name: "mock",
      async designSlide({ slide }) {
        calls.push(slide.id);
        return { operations: [], rationale: `seen ${slide.id}` };
      },
    };
    const result = await designPassHandler({
      presentation: makePresentation(),
      designer: mock,
    });
    expect(calls).toEqual(["slide-1"]);
    expect(result.rationales[0]?.rationale).toBe("seen slide-1");
  });
});

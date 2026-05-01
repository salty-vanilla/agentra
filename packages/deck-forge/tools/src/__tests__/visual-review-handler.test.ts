import type { PresentationIR, VisualReviewer } from "@deck-forge/core";
import { describe, expect, it } from "vitest";

import { getVisualReviewer, setVisualReviewer, visualReviewHandler } from "#src/index.js";

function makePresentation(): PresentationIR {
  return {
    id: "deck-1",
    version: "1.0.0",
    meta: {
      title: "T",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    theme: {
      id: "th",
      name: "th",
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
        fontFamily: { heading: "I", body: "I" },
        fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
      radius: { sm: 4, md: 8, lg: 12 },
      slideDefaults: {},
      elementDefaults: {},
    } as PresentationIR["theme"],
    slides: [],
    assets: { assets: [] },
    operationLog: [],
  } as PresentationIR;
}

describe("visualReviewHandler", () => {
  it("throws when no reviewer is configured", async () => {
    setVisualReviewer(undefined);
    await expect(visualReviewHandler({ presentation: makePresentation() })).rejects.toThrow(
      "VISUAL_REVIEWER_ERROR",
    );
  });

  it("uses a per-call reviewer override", async () => {
    setVisualReviewer(undefined);
    const reviewer: VisualReviewer = {
      name: "mock",
      async review() {
        return {
          findings: [{ slideId: "s", severity: "warning", category: "overlap", message: "x" }],
          operations: [
            {
              type: "update_text",
              slideId: "s",
              elementId: "e",
              text: "y",
            },
          ],
        };
      },
    };
    const result = await visualReviewHandler({
      presentation: makePresentation(),
      visualReviewer: reviewer,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.operations).toHaveLength(1);
  });

  it("uses the registered reviewer when no override is provided", async () => {
    const reviewer: VisualReviewer = {
      name: "registered",
      async review() {
        return { findings: [], operations: [] };
      },
    };
    setVisualReviewer(reviewer);
    expect(getVisualReviewer()).toBe(reviewer);
    const result = await visualReviewHandler({ presentation: makePresentation() });
    expect(result.findings).toEqual([]);
    setVisualReviewer(undefined);
  });

  it("forwards focus and slideImages to the reviewer", async () => {
    let receivedFocus: string[] | undefined;
    let receivedImageCount = 0;
    const reviewer: VisualReviewer = {
      name: "spy",
      async review(input) {
        receivedFocus = input.focus;
        receivedImageCount = input.slideImages?.length ?? 0;
        return { findings: [], operations: [] };
      },
    };
    await visualReviewHandler({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      focus: ["overlap", "color"],
      slideImages: [
        {
          slideId: "s1",
          mimeType: "image/png",
          data: new Uint8Array([1]),
          source: "ir-html",
        },
      ],
    });
    expect(receivedFocus).toEqual(["overlap", "color"]);
    expect(receivedImageCount).toBe(1);
  });
});

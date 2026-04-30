import { describe, expect, it } from "vitest";

import type {
  PresentationIR,
  SlideDesigner,
  SlideImage,
  SlideImageRenderer,
  VisualReviewer,
} from "#src/index.js";
import { runDesignReviewLoop } from "#src/runtime/design-review-loop.js";

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
      id: "t",
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
            text: { paragraphs: [{ runs: [{ text: "Hello" }] }] },
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

function makeRenderer(): SlideImageRenderer {
  let calls = 0;
  return {
    async render(): Promise<SlideImage[]> {
      calls += 1;
      return [
        {
          slideId: "slide-1",
          mimeType: "image/png",
          data: new Uint8Array([calls]),
          source: "ir-html",
        },
      ];
    },
  };
}

describe("runDesignReviewLoop", () => {
  it("converges immediately when reviewer returns no operations", async () => {
    const reviewer: VisualReviewer = {
      name: "noop",
      async review() {
        return { findings: [], operations: [] };
      },
    };
    const result = await runDesignReviewLoop({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      renderer: makeRenderer(),
    });
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0]?.converged).toBe(true);
    expect(result.stoppedReason).toBe("converged");
  });

  it("stops at maxIterations when the reviewer keeps proposing changes", async () => {
    const reviewer: VisualReviewer = {
      name: "infinite",
      async review() {
        return {
          findings: [
            { slideId: "slide-1", severity: "info", category: "x", message: "always changing" },
          ],
          operations: [
            {
              type: "update_text",
              slideId: "slide-1",
              elementId: "t1",
              text: "fixed",
            },
          ],
        };
      },
    };
    const result = await runDesignReviewLoop({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      renderer: makeRenderer(),
      maxIterations: 2,
    });
    expect(result.iterations).toHaveLength(2);
    expect(result.stoppedReason).toBe("max-iterations");
  });

  it("invokes the designer at the start of every iteration when supplied", async () => {
    const designerCalls: string[] = [];
    const designer: SlideDesigner = {
      name: "spy",
      async designSlide({ slide }) {
        designerCalls.push(slide.id);
        return { operations: [], rationale: "ok" };
      },
    };
    const reviewer: VisualReviewer = {
      name: "noop",
      async review() {
        return { findings: [], operations: [] };
      },
    };
    const result = await runDesignReviewLoop({
      presentation: makePresentation(),
      designer,
      visualReviewer: reviewer,
      renderer: makeRenderer(),
    });
    expect(designerCalls).toEqual(["slide-1"]);
    expect(result.iterations[0]?.designerRationales).toHaveLength(1);
  });

  it("respects stopWhen() callback", async () => {
    let calls = 0;
    const reviewer: VisualReviewer = {
      name: "stoppable",
      async review() {
        calls += 1;
        return {
          findings: [],
          operations: [
            {
              type: "update_text",
              slideId: "slide-1",
              elementId: "t1",
              text: `iter-${calls}`,
            },
          ],
        };
      },
    };
    const result = await runDesignReviewLoop({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      renderer: makeRenderer(),
      maxIterations: 5,
      stopWhen: (iter) => iter.iteration === 1,
    });
    expect(result.iterations).toHaveLength(2);
    expect(result.stoppedReason).toBe("stop-when");
  });

  it("renders slide images per iteration via the configured renderer", async () => {
    let renderCount = 0;
    const renderer: SlideImageRenderer = {
      async render() {
        renderCount += 1;
        return [
          {
            slideId: "slide-1",
            mimeType: "image/png",
            data: new Uint8Array([renderCount]),
            source: "ir-html",
          },
        ];
      },
    };
    const reviewer: VisualReviewer = {
      name: "noop",
      async review() {
        return { findings: [], operations: [] };
      },
    };
    await runDesignReviewLoop({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      renderer,
    });
    expect(renderCount).toBe(1);
  });

  it("returns a final export validation report when a validator is supplied", async () => {
    const reviewer: VisualReviewer = {
      name: "noop",
      async review() {
        return { findings: [], operations: [] };
      },
    };

    const result = await runDesignReviewLoop({
      presentation: makePresentation(),
      visualReviewer: reviewer,
      renderer: makeRenderer(),
      validateFinal: async () => ({
        status: "failed",
        issues: [
          {
            id: "vi-test",
            severity: "error",
            category: "layout",
            message: "Elements overlap",
          },
        ],
        summary: { errorCount: 1, warningCount: 0, infoCount: 0 },
      }),
      finalValidationLevel: "export",
    });

    expect(result.finalValidationReport?.status).toBe("failed");
    expect(result.finalValidationReport?.summary.errorCount).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildReviewPacketHandler,
  exportSlideImagesHandler,
  planPresentationOperationsHandler,
  reviewPresentationHandler,
  setPresentationOperationPlanner,
  setPresentationReviewer,
  setSlideImageRenderer,
} from "#src/index.js";

describe("review/plan handlers", () => {
  it("throws when reviewer is not configured", async () => {
    setPresentationReviewer(undefined);
    await expect(
      reviewPresentationHandler({
        presentation: {} as never,
      }),
    ).rejects.toThrow("REVIEWER_ERROR");
  });

  it("returns issues and operations from configured adapters", async () => {
    setPresentationReviewer({
      review: async () => [
        {
          code: "layout_overlap",
          severity: "warning",
          message: "elements overlap",
        },
      ],
    });
    setPresentationOperationPlanner({
      plan: async () => [
        {
          type: "update_text",
          slideId: "s1",
          elementId: "t1",
          text: "fixed",
        },
      ],
    });

    const review = await reviewPresentationHandler({
      presentation: {} as never,
    });
    const plan = await planPresentationOperationsHandler({
      presentation: {} as never,
      issues: review.issues,
    });

    expect(review.issues).toHaveLength(1);
    expect(plan.operations).toHaveLength(1);
  });

  it("prefers input adapters over module-level fallback adapters", async () => {
    setPresentationReviewer({
      review: async () => [
        {
          code: "fallback",
          severity: "warning",
          message: "fallback",
        },
      ],
    });
    setPresentationOperationPlanner({
      plan: async () => [],
    });

    const review = await reviewPresentationHandler({
      presentation: {} as never,
      reviewer: {
        review: async () => [
          {
            code: "input",
            severity: "warning",
            message: "input",
          },
        ],
      },
    });
    const plan = await planPresentationOperationsHandler({
      presentation: {} as never,
      issues: review.issues,
      operationPlanner: {
        plan: async () => [
          {
            type: "update_text",
            slideId: "s1",
            elementId: "t1",
            text: "input",
          },
        ],
      },
    });

    expect(review.issues[0]?.code).toBe("input");
    expect(plan.operations).toHaveLength(1);
  });

  it("exports slide images through configured renderer", async () => {
    setSlideImageRenderer({
      render: async () => [
        {
          slideId: "slide-1",
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
          width: 1280,
          height: 720,
        },
      ],
    });

    const result = await exportSlideImagesHandler({
      presentation: {} as never,
    });

    expect(result.images[0]?.slideId).toBe("slide-1");
    expect(result.images[0]?.dataBase64).toBe("AQID");
    expect(result.images[0]?.width).toBe(1280);
    setSlideImageRenderer(undefined);
  });

  it("builds review packets with rendered slide images", async () => {
    const result = await buildReviewPacketHandler({
      userRequest: "Review rendered packet.",
      presentation: {
        id: "deck-1",
        version: "1.0.0",
        meta: {
          title: "Deck",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        theme: {
          id: "theme-1",
          name: "Theme",
          colors: {
            background: "#FFFFFF",
            surface: "#FFFFFF",
            textPrimary: "#111111",
            textSecondary: "#333333",
            primary: "#111111",
            secondary: "#222222",
            accent: "#333333",
            chartPalette: ["#111111"],
          },
          typography: {
            fontFamily: { heading: "Arial", body: "Arial", mono: "Courier New" },
            fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
            lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.7 },
            weight: { regular: 400, medium: 500, bold: 700 },
          },
          spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
          radius: { none: 0, sm: 4, md: 8, lg: 12, full: 999 },
          slideDefaults: { backgroundColor: "#FFFFFF", padding: 24 },
          elementDefaults: {
            text: { fontFamily: "Arial", fontSize: 18, color: "#111111" },
          },
        },
        slides: [],
        assets: { assets: [] },
        operationLog: [],
      },
      renderImages: true,
      renderer: {
        render: async () => [
          {
            slideId: "slide-1",
            mimeType: "image/png",
            data: new Uint8Array([1, 2, 3]),
            source: "external",
            renderer: "test-renderer",
          },
        ],
      },
    });

    expect(result.packet.slideImages?.[0]?.dataBase64).toBe("AQID");
    expect(result.packet.slideImages?.[0]?.source).toBe("external");
    expect(result.packet.slideImages?.[0]?.renderer).toBe("test-renderer");
  });
});

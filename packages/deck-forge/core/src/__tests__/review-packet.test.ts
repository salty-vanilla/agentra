import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { buildReviewPacket } from "#src/review/build-review-packet.js";
import type { SlideImageRenderer } from "#src/review/types.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

describe("buildReviewPacket", () => {
  it("builds a packet without slide images when no renderer is supplied", async () => {
    const report = await validatePresentation(presentationFixture);
    const packet = await buildReviewPacket({
      userRequest: "Summarize the quarterly performance.",
      presentation: presentationFixture,
      validationReport: report,
      grounding: {
        language: "en",
        requestedSlideCount: presentationFixture.slides.length,
      },
    });

    expect(packet.userRequest).toBe("Summarize the quarterly performance.");
    expect(packet.inspect.deck?.slideCount).toBe(presentationFixture.slides.length);
    expect(packet.inspect.text?.length).toBeGreaterThan(0);
    expect(packet.validationReport).toBe(report);
    expect(packet.slideImages).toBeUndefined();
  });

  it("includes slide images when a renderer is supplied", async () => {
    const renderer: SlideImageRenderer = {
      render: async ({ slideIds }) => [
        {
          slideId: slideIds?.[0] ?? "slide-text",
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
          width: 1280,
          height: 720,
        },
      ],
    };

    const packet = await buildReviewPacket({
      userRequest: "Review visual quality.",
      presentation: presentationFixture,
      renderer,
      renderImages: true,
      slideIds: ["slide-text"],
    });

    expect(packet.slideImages).toHaveLength(1);
    expect(packet.slideImages?.[0]?.slideId).toBe("slide-text");
    expect(packet.slideImages?.[0]?.mimeType).toBe("image/png");
  });
});

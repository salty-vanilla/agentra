import { describe, expect, it } from "vitest";

import {
  createPresentationSpec,
  generateAssetPlan,
  generateDeckPlan,
  generateSlideSpecs,
} from "#src/index.js";

describe("spec generation", () => {
  it("creates brief from user request", async () => {
    const result = await createPresentationSpec({
      userRequest: "Q4 operating plan for executive review",
      slideCount: 7,
      outputFormat: "pptx",
    });

    expect(result.brief.title).toContain("Q4 operating plan");
    expect(result.brief.constraints.slideCount).toBe(7);
    expect(result.brief.output.formats).toContain("pptx");
  });

  it("generates deck plan and slide specs with intent on all slides", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Customer support transformation roadmap",
      slideCount: 5,
    });
    const { deckPlan } = await generateDeckPlan({ brief });
    const { slideSpecs } = await generateSlideSpecs({ brief, deckPlan });

    expect(deckPlan.slideCountTarget).toBe(5);
    expect(slideSpecs).toHaveLength(5);
    for (const slide of slideSpecs) {
      expect(slide.intent.type).toBeDefined();
      expect(slide.intent.keyMessage.length).toBeGreaterThan(0);
    }
  });

  it("generates image assets for visual slide layouts", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Product launch deck",
      slideCount: 4,
    });
    const { assetSpecs } = await generateAssetPlan({
      brief,
      slideSpecs: [
        {
          id: "slide-hero",
          title: "Hero",
          intent: {
            type: "proposal",
            keyMessage: "Launch momentum",
            audienceTakeaway: "Brand story is clear",
          },
          layout: { type: "hero", density: "low", emphasis: "visual" },
          content: [
            {
              id: "cb-title",
              type: "title",
              text: "Launch momentum",
            },
          ],
        },
      ],
    });

    expect(assetSpecs).toHaveLength(1);
    expect(assetSpecs[0]?.type).toBe("generated_image");
  });

  it("supports retrieve mode in asset planning", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Factory modernization proposal",
      slideCount: 4,
    });
    const { assetSpecs } = await generateAssetPlan({
      brief,
      acquisitionMode: "retrieve",
      slideSpecs: [
        {
          id: "slide-hero",
          title: "Factory hero",
          intent: {
            type: "proposal",
            keyMessage: "New line with automation",
            audienceTakeaway: "Execution image is concrete",
          },
          layout: { type: "hero", density: "low", emphasis: "visual" },
          content: [{ id: "cb-title", type: "title", text: "Factory hero" }],
        },
      ],
    });

    expect(assetSpecs).toHaveLength(1);
    expect(assetSpecs[0]?.type).toBe("retrieved_image");
    expect(assetSpecs[0]).toMatchObject({ provider: "pexels" });
  });

  it("supports explicit retrieved image providers", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Tokyo event guide",
      slideCount: 4,
    });
    const { assetSpecs } = await generateAssetPlan({
      brief,
      acquisitionMode: "retrieve",
      imageProvider: "pixabay",
      slideSpecs: [
        {
          id: "slide-hero",
          title: "Tokyo events",
          intent: {
            type: "proposal",
            keyMessage: "Find local events",
            audienceTakeaway: "Options are clear",
          },
          layout: { type: "hero", density: "low", emphasis: "visual" },
          content: [{ id: "cb-title", type: "title", text: "Tokyo events" }],
        },
      ],
    });

    expect(assetSpecs[0]).toMatchObject({ type: "retrieved_image", provider: "pixabay" });
  });

  it("keeps fallback generation generic and free of blocked filler strings", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Customer support transformation roadmap",
      slideCount: 5,
    });
    const { deckPlan } = await generateDeckPlan({ brief });
    const { slideSpecs } = await generateSlideSpecs({ brief, deckPlan });
    const serialized = JSON.stringify(slideSpecs);

    expect(serialized).not.toContain("Proposal Point");
    expect(serialized).not.toContain("Execution Plan");
    expect(serialized).not.toContain("Key Insight");
    expect(serialized).not.toContain("Evidence and context supporting this message.");
  });
});

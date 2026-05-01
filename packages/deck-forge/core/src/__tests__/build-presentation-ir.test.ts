import { describe, expect, it } from "vitest";

import {
  type SlideSpec,
  buildPresentationIr,
  createPresentationSpec,
  generateDeckPlan,
} from "#src/index.js";

describe("buildPresentationIr", () => {
  it("builds deterministic PresentationIR with resolved slides and generated asset linkage", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Quarterly platform strategy review",
      slideCount: 2,
    });
    const { deckPlan } = await generateDeckPlan({ brief });
    const slidePlan = deckPlan.sections[0]?.slides[0];
    expect(slidePlan).toBeDefined();
    if (!slidePlan) {
      throw new Error("expected first slide plan");
    }

    const slideSpecs: SlideSpec[] = [
      {
        id: "slide-overview",
        slideNumber: 1,
        title: "Overview",
        intent: slidePlan.intent,
        layout: {
          type: "single_column",
          density: "medium",
          emphasis: "top",
        },
        content: [
          { id: "block-title", type: "title", text: "Overview" },
          { id: "block-subtitle", type: "subtitle", text: "Why this matters now" },
          { id: "block-paragraph", type: "paragraph", text: "A concise executive summary." },
          {
            id: "block-bullets",
            type: "bullet_list",
            items: [{ text: "Signal 1" }, { text: "Signal 2", children: [{ text: "Detail 2.1" }] }],
          },
          {
            id: "block-table",
            type: "table",
            headers: ["KPI", "Value"],
            rows: [["Growth", "18%"]],
          },
          { id: "block-image", type: "image", assetId: "asset-hero-001" },
          {
            id: "block-callout",
            type: "callout",
            text: "Action needed this month",
            tone: "warning",
          },
        ],
        assets: [{ assetId: "asset-hero-001", role: "hero" }],
      },
    ];

    const first = buildPresentationIr({
      brief,
      deckPlan,
      slideSpecs,
      assetSpecs: [
        {
          id: "asset-hero-001",
          type: "generated_image",
          purpose: "hero",
          visualDirection: brief.visualDirection,
          prompt: "Executive hero visual",
          aspectRatio: "16:9",
          targetSlideIds: ["slide-overview", "slide-does-not-exist"],
        },
      ],
    });
    const second = buildPresentationIr({
      brief,
      deckPlan,
      slideSpecs,
      assetSpecs: [
        {
          id: "asset-hero-001",
          type: "generated_image",
          purpose: "hero",
          visualDirection: brief.visualDirection,
          prompt: "Executive hero visual",
          aspectRatio: "16:9",
          targetSlideIds: ["slide-overview", "slide-does-not-exist"],
        },
      ],
    });

    expect(first).toEqual(second);
    expect(first.meta.title).toBe(deckPlan.title);
    expect(first.theme.id).toContain("theme-");
    expect(first.operationLog).toHaveLength(1);
    expect(first.slides).toHaveLength(1);

    const slide = first.slides[0];
    expect(slide).toBeDefined();
    if (!slide) {
      throw new Error("expected first slide");
    }
    expect(slide.id).toBe("slide-overview");
    expect(slide.layout.regions.length).toBeGreaterThan(0);

    const textRoles = slide.elements
      .filter((element) => element.type === "text")
      .map((element) => element.role);
    expect(textRoles).toContain("title");
    expect(textRoles).toContain("subtitle");
    expect(textRoles).toContain("body");
    expect(textRoles).toContain("callout");
    expect(slide.elements.some((element) => element.type === "table")).toBe(true);
    expect(slide.elements.some((element) => element.type === "image")).toBe(true);

    const generatedAsset = first.assets.assets.find((asset) => asset.id === "asset-hero-001");
    expect(generatedAsset?.uri).toBe("generated://asset-hero-001.png");
    expect(generatedAsset?.usage.some((usage) => usage.slideId === "slide-overview")).toBe(true);
  });

  it("adds fallback title and placeholder assets for image references without asset specs", async () => {
    const { brief } = await createPresentationSpec({
      userRequest: "Engineering weekly update",
      slideCount: 1,
    });
    const { deckPlan } = await generateDeckPlan({ brief });
    const slidePlan = deckPlan.sections[0]?.slides[0];
    expect(slidePlan).toBeDefined();
    if (!slidePlan) {
      throw new Error("expected first slide plan");
    }

    const presentation = buildPresentationIr({
      brief,
      deckPlan,
      slideSpecs: [
        {
          id: "slide-no-title",
          title: "Fallback Title",
          intent: slidePlan.intent,
          layout: {
            type: "hero",
            density: "low",
            emphasis: "visual",
          },
          content: [{ id: "image-only", type: "image", assetId: "asset-missing-001" }],
        },
      ],
      assetSpecs: [],
    });

    const slide = presentation.slides[0];
    expect(slide).toBeDefined();
    if (!slide) {
      throw new Error("expected first slide");
    }
    const fallbackTitle = slide.elements.find(
      (element) => element.type === "text" && element.role === "title",
    );
    expect(fallbackTitle).toBeDefined();

    const placeholderAsset = presentation.assets.assets.find(
      (asset) => asset.id === "asset-missing-001",
    );
    expect(placeholderAsset?.uri).toBe("placeholder://asset-missing-001.png");
    expect(
      placeholderAsset?.usage.some(
        (usage) => usage.slideId === "slide-no-title" && usage.elementId === "image-only",
      ),
    ).toBe(true);
  });
});

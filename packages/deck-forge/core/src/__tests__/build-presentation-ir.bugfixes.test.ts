import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import type { AssetSpec, DeckPlan, PresentationBrief, SlideSpec } from "#src/index.js";

// Minimal-but-valid-enough Brief for builder consumption.  The builder does
// not run zod validation on input, so optional fields can be elided.
function makeBrief(overrides: Partial<PresentationBrief> = {}): PresentationBrief {
  const base = {
    id: "brief-1",
    title: "Test Brief",
    audience: { primary: "Engineers", expertiseLevel: "intermediate" },
    goal: { type: "inform", primaryGoal: "share knowledge" },
    tone: { register: "neutral", energy: "calm" },
    narrative: { framework: "scqa", steps: [] },
    output: { format: ["pptx"] },
    constraints: { mustInclude: [], mustAvoid: [] },
    visualDirection: { style: "minimal", mood: "trustworthy" },
  } as unknown as PresentationBrief;
  return { ...base, ...overrides };
}

function makeDeckPlan(): DeckPlan {
  return {
    id: "deck-1",
    briefId: "brief-1",
    title: "Test Deck",
    slideCountTarget: 1,
    sections: [],
    globalStoryline: "test",
  } as DeckPlan;
}

function makeSlideSpec(
  content: SlideSpec["content"],
  overrides: Partial<SlideSpec> = {},
): SlideSpec {
  return {
    id: "slide-1",
    slideNumber: 1,
    title: "Test Slide",
    intent: {
      type: "data_insight",
      keyMessage: "test",
      audienceTakeaway: "test",
    },
    layout: { type: "single_column", density: "medium" },
    content,
    ...overrides,
  } as SlideSpec;
}

// ---------------------------------------------------------------------------
// Bug A: MetricBlock must produce a rendered text element (not be silently dropped).
// ---------------------------------------------------------------------------
describe("buildPresentationIr — Bug A: metric block", () => {
  it("renders a MetricBlock as a callout-role text element", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "metric-1",
        type: "metric",
        label: "Revenue",
        value: "12.3",
        unit: "M",
        trend: "up",
      },
    ]);
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });
    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    const metricElement = slide?.elements.find((e) => e.id.includes("metric"));
    expect(metricElement).toBeDefined();
    expect(metricElement?.type).toBe("text");
    if (metricElement?.type === "text") {
      const flat = metricElement.text.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join("");
      expect(flat).toContain("Revenue");
      expect(flat).toContain("12.3");
      expect(flat).toContain("M");
      expect(flat).toContain("↑");
      expect(metricElement.role).toBe("callout");
    }
  });
});

// ---------------------------------------------------------------------------
// Bug C: brief.visualDirection.mood must influence theme colors when brand is absent.
// ---------------------------------------------------------------------------
describe("buildPresentationIr — Bug C: createTheme uses visualDirection.mood", () => {
  it("uses energetic palette when brand is absent and mood=energetic", () => {
    const ir = buildPresentationIr({
      brief: makeBrief({
        visualDirection: {
          style: "minimal",
          mood: "energetic",
        } as PresentationBrief["visualDirection"],
        brand: undefined,
      }),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec([])],
    });
    // MOOD_PALETTES.energetic.primary = #F59E0B
    expect(ir.theme.colors.primary).toBe("#F59E0B");
    expect(ir.theme.colors.background).toBe("#FFFBEB");
  });

  it("uses futuristic palette for mood=futuristic", () => {
    const ir = buildPresentationIr({
      brief: makeBrief({
        visualDirection: {
          style: "minimal",
          mood: "futuristic",
        } as PresentationBrief["visualDirection"],
        brand: undefined,
      }),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec([])],
    });
    expect(ir.theme.colors.primary).toBe("#6366F1");
    expect(ir.theme.colors.background).toBe("#0F172A");
  });

  it("brand.colors take precedence over mood palette", () => {
    const ir = buildPresentationIr({
      brief: makeBrief({
        visualDirection: {
          style: "minimal",
          mood: "energetic",
        } as PresentationBrief["visualDirection"],
        brand: { name: "Acme", colors: { primary: "#123456" } } as PresentationBrief["brand"],
      }),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec([])],
    });
    expect(ir.theme.colors.primary).toBe("#123456");
  });

  it("falls back to built-in defaults when neither brand nor mood is meaningful", () => {
    const ir = buildPresentationIr({
      brief: makeBrief({
        visualDirection: {
          style: "minimal",
          mood: "trustworthy",
        } as PresentationBrief["visualDirection"],
        brand: undefined,
      }),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec([])],
    });
    // trustworthy palette: primary #1D4ED8 (matches old default too — proves at least
    // mood is read without throwing).
    expect(ir.theme.colors.primary).toBe("#1D4ED8");
  });
});

// ---------------------------------------------------------------------------
// Bug D: assetSpec/slide.assets must not produce phantom asset-ref-* / asset-target-* element IDs.
// ---------------------------------------------------------------------------
describe("buildPresentationIr — Bug D: no phantom asset usage element IDs", () => {
  it("does not synthesize asset-ref-* element IDs from slideSpec.assets[]", () => {
    const slideSpec = makeSlideSpec([], {
      assets: [{ id: "asset-1", purpose: "hero" } as never],
    });
    const assetSpec = {
      id: "asset-1",
      type: "generated_image",
      purpose: "hero",
      prompt: "test",
      targetSlideIds: ["slide-1"],
    } as unknown as AssetSpec;
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
      assetSpecs: [assetSpec],
    });
    const asset = ir.assets.assets.find((a) => a.id === "asset-1");
    expect(asset).toBeDefined();
    for (const usage of asset?.usage ?? []) {
      expect(usage.elementId ?? "").not.toMatch(/^asset-ref-/);
      expect(usage.elementId ?? "").not.toMatch(/^asset-target-/);
    }
  });

  it("emits a real elementId only for assets actually rendered as image elements", () => {
    const slideSpec = makeSlideSpec([{ id: "img-1", type: "image", assetId: "asset-1" } as never]);
    const assetSpec = {
      id: "asset-1",
      type: "generated_image",
      purpose: "hero",
      prompt: "test",
    } as unknown as AssetSpec;
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
      assetSpecs: [assetSpec],
    });
    const asset = ir.assets.assets.find((a) => a.id === "asset-1");
    expect(asset?.usage.length).toBeGreaterThan(0);
    const realElementIds = ir.slides[0]?.elements.map((e) => e.id) ?? [];
    for (const usage of asset?.usage ?? []) {
      if (usage.elementId) {
        expect(realElementIds).toContain(usage.elementId);
      }
    }
  });
});

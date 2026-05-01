import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { inspectPresentation } from "#src/inspect/inspect-presentation.js";
import { resolveAnchor } from "#src/inspect/resolve-anchor.js";

describe("inspectPresentation", () => {
  it("returns filtered text and element data by slideId", async () => {
    const result = await inspectPresentation(presentationFixture, {
      include: ["slides", "elements", "text"],
      slideId: "slide-text",
    });

    expect(result.slides).toHaveLength(1);
    expect(result.slides?.[0]?.id).toBe("slide-text");
    expect(result.elements).toHaveLength(1);
    expect(result.elements?.[0]?.id).toBe("el-body");
    expect(result.text).toEqual([
      {
        slideId: "slide-text",
        elementId: "el-body",
        role: "body",
        text: "Revenue grew 18% YoY with margin improvement in enterprise segment.",
      },
    ]);
  });

  it("resolves targetId during inspection", async () => {
    const result = await inspectPresentation(presentationFixture, {
      include: ["deck"],
      targetId: "el/el-body",
    });

    expect(result.target?.kind).toBe("element");
    expect(result.target?.id).toBe("el-body");
  });

  it("filters assets for a specific image element", async () => {
    const result = await inspectPresentation(presentationFixture, {
      include: ["assets", "elements"],
      slideId: "slide-image",
      elementId: "el-image",
    });

    expect(result.assets).toHaveLength(1);
    expect(result.assets?.[0]?.id).toBe("asset-hero-001");
  });
});

describe("resolveAnchor", () => {
  it("resolves deck/slide/element/asset anchors", () => {
    const deck = resolveAnchor(presentationFixture, "deck/deck-001");
    const slide = resolveAnchor(presentationFixture, "sl/slide-text");
    const element = resolveAnchor(presentationFixture, "element/el-body");
    const asset = resolveAnchor(presentationFixture, "as/asset-hero-001");

    expect(deck.kind).toBe("deck");
    expect(slide.kind).toBe("slide");
    expect(element.kind).toBe("element");
    expect(asset.kind).toBe("asset");
  });

  it("resolves text range anchors", () => {
    const full = resolveAnchor(presentationFixture, "text/el-body/range/r1");
    const short = resolveAnchor(presentationFixture, "tr/r2");

    expect(full.kind).toBe("text_range");
    if (full.kind !== "text_range") {
      throw new Error("unexpected anchor kind");
    }
    expect(full.target.rangeId).toBe("r1");
    expect(short.kind).toBe("text_range");
    if (short.kind !== "text_range") {
      throw new Error("unexpected anchor kind");
    }
    expect(short.target.rangeId).toBe("r2");
  });

  it("throws for invalid or missing anchors", () => {
    expect(() => resolveAnchor(presentationFixture, "slide/does-not-exist")).toThrow(
      "Slide anchor not found",
    );
    expect(() => resolveAnchor(presentationFixture, "unknown/abc")).toThrow(
      "Unsupported anchor type",
    );
  });
});

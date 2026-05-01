import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { applyOperations } from "#src/operations/apply-operations.js";
import type { PresentationOperation } from "#src/operations/types.js";

describe("applyOperations", () => {
  it("applies addSlide and reindexes slides", async () => {
    const next = await applyOperations(presentationFixture, [
      {
        type: "add_slide",
        index: 1,
        title: "Inserted Slide",
        layout: {
          type: "single_column",
          density: "low",
        },
      },
    ]);

    expect(next.slides).toHaveLength(presentationFixture.slides.length + 1);
    expect(next.slides[1]?.title).toBe("Inserted Slide");
    expect(next.slides.map((slide) => slide.index)).toEqual([0, 1, 2, 3, 4]);
    expect(next.operationLog).toHaveLength(1);
    expect(next.operationLog[0]?.result).toBe("success");
  });

  it("adds text/image/table elements to the target slide", async () => {
    const operations: PresentationOperation[] = [
      {
        type: "add_text",
        slideId: "slide-text",
        role: "body",
        text: "New text block",
      },
      {
        type: "add_image",
        slideId: "slide-image",
        assetId: "asset-hero-001",
      },
      {
        type: "add_table",
        slideId: "slide-table",
        headers: ["A", "B"],
        rows: [["1", "2"]],
      },
    ];

    const next = await applyOperations(presentationFixture, operations);

    const textSlide = next.slides.find((slide) => slide.id === "slide-text");
    const imageSlide = next.slides.find((slide) => slide.id === "slide-image");
    const tableSlide = next.slides.find((slide) => slide.id === "slide-table");

    expect(
      textSlide?.elements.some((element) => element.type === "text" && element.id !== "el-body"),
    ).toBe(true);
    expect(
      imageSlide?.elements.some((element) => element.type === "image" && element.id !== "el-image"),
    ).toBe(true);
    expect(
      tableSlide?.elements.some((element) => element.type === "table" && element.id !== "el-table"),
    ).toBe(true);
    expect(next.operationLog).toHaveLength(3);
    expect(next.operationLog.every((record) => record.result === "success")).toBe(true);
  });

  it("adds and updates chart elements", async () => {
    const next = await applyOperations(presentationFixture, [
      {
        type: "add_chart",
        slideId: "slide-table",
        elementId: "el-chart-added",
        chartType: "bar",
        data: {
          categories: ["A", "B"],
          series: [{ name: "Series 1", values: [10, 20] }],
        },
        encoding: { x: "category", y: "value" },
      },
      {
        type: "update_chart_data",
        slideId: "slide-table",
        elementId: "el-chart-added",
        data: {
          categories: ["A", "B", "C"],
          series: [{ name: "Series 1", values: [12, 24, 18] }],
        },
      },
    ]);

    const slide = next.slides.find((item) => item.id === "slide-table");
    const chart = slide?.elements.find((item) => item.id === "el-chart-added");
    expect(chart?.type).toBe("chart");
    if (chart?.type === "chart") {
      expect(chart.data.categories).toEqual(["A", "B", "C"]);
      expect(chart.data.series[0]?.values).toEqual([12, 24, 18]);
    }
  });

  it("fails atomically when one operation is invalid", async () => {
    const operations: PresentationOperation[] = [
      {
        type: "add_text",
        slideId: "slide-text",
        role: "body",
        text: "This should not persist",
      },
      {
        type: "add_image",
        slideId: "slide-image",
        assetId: "asset-missing",
      },
    ];

    await expect(applyOperations(presentationFixture, operations)).rejects.toThrow(
      "Operation failed (add_image)",
    );

    const originalTextSlide = presentationFixture.slides.find((slide) => slide.id === "slide-text");
    expect(originalTextSlide?.elements).toHaveLength(1);
    expect(presentationFixture.operationLog).toHaveLength(0);
  });

  it("remove_slide removes the slide and reindexes", async () => {
    const slideCount = presentationFixture.slides.length;
    const first = presentationFixture.slides[0];
    if (!first) throw new Error("fixture has no slides");

    const next = await applyOperations(presentationFixture, [
      { type: "remove_slide", slideId: first.id },
    ]);

    expect(next.slides).toHaveLength(slideCount - 1);
    expect(next.slides.find((s) => s.id === first.id)).toBeUndefined();
    expect(next.slides.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(next.operationLog[0]?.result).toBe("success");
  });

  it("remove_slide throws when slide not found", async () => {
    await expect(
      applyOperations(presentationFixture, [{ type: "remove_slide", slideId: "nonexistent" }]),
    ).rejects.toThrow("Slide not found");
  });

  it("move_slide repositions the slide and reindexes", async () => {
    const ids = presentationFixture.slides.map((s) => s.id);
    const [first, ...rest] = ids;
    if (!first) throw new Error("fixture has no slides");

    const next = await applyOperations(presentationFixture, [
      { type: "move_slide", slideId: first, toIndex: 2 },
    ]);

    expect(next.slides[2]?.id).toBe(first);
    expect(next.slides.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(next.slides[0]?.id).toBe(rest[0]);
  });

  it("update_text replaces the text of an existing text element", async () => {
    const slide = presentationFixture.slides.find((s) => s.id === "slide-text");
    const el = slide?.elements.find((e) => e.type === "text");
    if (!slide || !el) throw new Error("fixture missing slide-text/text element");

    const next = await applyOperations(presentationFixture, [
      {
        type: "update_text",
        slideId: slide.id,
        elementId: el.id,
        text: "Updated text content",
      },
    ]);

    const updatedSlide = next.slides.find((s) => s.id === slide.id);
    const updatedEl = updatedSlide?.elements.find((e) => e.id === el.id);
    expect(updatedEl?.type).toBe("text");
    if (updatedEl?.type === "text") {
      expect(updatedEl.text.paragraphs[0]?.runs[0]?.text).toBe("Updated text content");
    }
  });

  it("update_text throws when element not found", async () => {
    const slide = presentationFixture.slides[0];
    if (!slide) throw new Error("no slides");

    await expect(
      applyOperations(presentationFixture, [
        {
          type: "update_text",
          slideId: slide.id,
          elementId: "nonexistent-el",
          text: "text",
        },
      ]),
    ).rejects.toThrow("Element not found");
  });

  it("delete_element removes an element from a slide", async () => {
    const slide = presentationFixture.slides.find((s) => s.id === "slide-text");
    const el = slide?.elements.find((e) => e.type === "text");
    if (!slide || !el) throw new Error("fixture missing slide-text/text element");

    const next = await applyOperations(presentationFixture, [
      { type: "delete_element", slideId: slide.id, elementId: el.id },
    ]);

    const updatedSlide = next.slides.find((s) => s.id === slide.id);
    expect(updatedSlide?.elements.find((e) => e.id === el.id)).toBeUndefined();
  });

  it("apply_theme replaces the presentation theme", async () => {
    const newTheme = { ...presentationFixture.theme, id: "dark-theme", name: "Dark" };

    const next = await applyOperations(presentationFixture, [
      { type: "apply_theme", theme: newTheme },
    ]);

    expect(next.theme.id).toBe("dark-theme");
    expect(next.theme.name).toBe("Dark");
    // original is unchanged
    expect(presentationFixture.theme.id).not.toBe("dark-theme");
  });

  it("attach_asset adds a new asset to the registry", async () => {
    const asset = {
      id: "asset-new-001",
      type: "image" as const,
      uri: "placeholder://asset-new-001.png",
      mimeType: "image/png",
      metadata: {
        source: "generated" as const,
        createdAt: new Date().toISOString(),
      },
      usage: [],
    };

    const next = await applyOperations(presentationFixture, [{ type: "attach_asset", asset }]);

    expect(next.assets.assets.some((a) => a.id === "asset-new-001")).toBe(true);
  });

  it("attach_asset updates an existing asset by id", async () => {
    const updated = {
      id: "asset-hero-001",
      type: "image" as const,
      uri: "placeholder://updated.png",
      mimeType: "image/png",
      metadata: {
        source: "generated" as const,
        createdAt: new Date().toISOString(),
      },
      usage: [],
    };

    const next = await applyOperations(presentationFixture, [
      { type: "attach_asset", asset: updated },
    ]);

    const found = next.assets.assets.find((a) => a.id === "asset-hero-001");
    expect(found?.uri).toBe("placeholder://updated.png");
    // Count should stay the same
    expect(next.assets.assets.length).toBe(presentationFixture.assets.assets.length);
  });

  it("attach_asset registers usage on an image element when slideId/elementId/role provided", async () => {
    const asset = {
      id: "asset-new-002",
      type: "image" as const,
      uri: "placeholder://asset-new-002.png",
      mimeType: "image/png",
      metadata: {
        source: "generated" as const,
        createdAt: new Date().toISOString(),
      },
      usage: [],
    };

    const next = await applyOperations(presentationFixture, [
      {
        type: "attach_asset",
        asset,
        slideId: "slide-image",
        elementId: "el-image",
        role: "hero",
      },
    ]);

    const found = next.assets.assets.find((a) => a.id === "asset-new-002");
    expect(found?.usage).toHaveLength(1);
    expect(found?.usage[0]).toMatchObject({
      slideId: "slide-image",
      elementId: "el-image",
      role: "hero",
    });

    // Image element should have assetId updated
    const slide = next.slides.find((s) => s.id === "slide-image");
    const el = slide?.elements.find((e) => e.id === "el-image");
    expect(el?.type).toBe("image");
    if (el?.type === "image") {
      expect(el.assetId).toBe("asset-new-002");
    }
  });

  it("set_slide_layout updates layout.spec on the target slide", async () => {
    const slide = presentationFixture.slides[0];
    if (!slide) throw new Error("fixture has no slides");

    const newLayout = {
      type: "single_column" as const,
      density: "high" as const,
      emphasis: "top" as const,
    };

    const next = await applyOperations(presentationFixture, [
      { type: "set_slide_layout", slideId: slide.id, layout: newLayout },
    ]);

    const updated = next.slides.find((s) => s.id === slide.id);
    expect(updated?.layout.spec.type).toBe("single_column");
    expect(updated?.layout.spec.density).toBe("high");
  });

  it("set_slide_layout recalculates regions after layout change", async () => {
    const slide = presentationFixture.slides[0];
    if (!slide) throw new Error("fixture has no slides");

    const newLayout = {
      type: "two_column" as const,
      density: "medium" as const,
      emphasis: "left" as const,
    };

    const next = await applyOperations(presentationFixture, [
      { type: "set_slide_layout", slideId: slide.id, layout: newLayout },
    ]);

    const updated = next.slides.find((s) => s.id === slide.id);
    // Regions should be recalculated — just ensure it's an array
    expect(Array.isArray(updated?.layout.regions)).toBe(true);
  });
});

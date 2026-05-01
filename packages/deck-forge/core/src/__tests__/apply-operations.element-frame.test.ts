import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { applyOperations } from "#src/operations/apply-operations.js";
import type { PresentationOperation } from "#src/operations/types.js";

describe("applyOperations – element frame operations", () => {
  describe("set_element_frame", () => {
    it("updates element frame to specified values", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "slide-title",
          elementId: "el-title",
          frame: { x: 100, y: 200, width: 500, height: 100 },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame).toEqual({ x: 100, y: 200, width: 500, height: 100 });
    });

    it("clamps frame to slide bounds", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "slide-title",
          elementId: "el-title",
          frame: { x: 1200, y: 650, width: 300, height: 200 },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      // Frame should be clamped within 1280x720 slide bounds
      expect(el!.frame.x + el!.frame.width).toBeLessThanOrEqual(1280);
      expect(el!.frame.y + el!.frame.height).toBeLessThanOrEqual(720);
      expect(el!.frame.x).toBeGreaterThanOrEqual(0);
      expect(el!.frame.y).toBeGreaterThanOrEqual(0);
    });

    it("enforces minimum width/height of 20px", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "slide-title",
          elementId: "el-title",
          frame: { x: 100, y: 100, width: 5, height: 3 },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.width).toBeGreaterThanOrEqual(20);
      expect(el!.frame.height).toBeGreaterThanOrEqual(20);
    });

    it("skips silently when elementId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "slide-title",
          elementId: "nonexistent-element",
          frame: { x: 100, y: 100, width: 200, height: 100 },
        },
      ];

      // Should not throw
      const next = await applyOperations(presentationFixture, ops);
      // Original element is unchanged
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame).toEqual(presentationFixture.slides[0]!.elements[0]!.frame);
    });

    it("skips silently when slideId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "nonexistent-slide",
          elementId: "el-title",
          frame: { x: 100, y: 100, width: 200, height: 100 },
        },
      ];

      // Should not throw
      const next = await applyOperations(presentationFixture, ops);
      expect(next.slides).toHaveLength(presentationFixture.slides.length);
    });
  });

  describe("move_element", () => {
    it("updates x/y and preserves width/height", async () => {
      const original = presentationFixture.slides[0]!.elements[0]!.frame;
      const ops: PresentationOperation[] = [
        {
          type: "move_element",
          slideId: "slide-title",
          elementId: "el-title",
          x: 50,
          y: 100,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.x).toBe(50);
      expect(el!.frame.y).toBe(100);
      expect(el!.frame.width).toBe(original.width);
      expect(el!.frame.height).toBe(original.height);
    });

    it("clamps position to keep element within slide bounds", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "move_element",
          slideId: "slide-title",
          elementId: "el-title",
          x: 1500,
          y: 900,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.x + el!.frame.width).toBeLessThanOrEqual(1280);
      expect(el!.frame.y + el!.frame.height).toBeLessThanOrEqual(720);
    });

    it("skips silently when elementId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "move_element",
          slideId: "slide-title",
          elementId: "nonexistent",
          x: 200,
          y: 300,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame).toEqual(presentationFixture.slides[0]!.elements[0]!.frame);
    });
  });

  describe("resize_element", () => {
    it("updates width/height and preserves x/y", async () => {
      const original = presentationFixture.slides[0]!.elements[0]!.frame;
      const ops: PresentationOperation[] = [
        {
          type: "resize_element",
          slideId: "slide-title",
          elementId: "el-title",
          width: 600,
          height: 200,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.x).toBe(original.x);
      expect(el!.frame.y).toBe(original.y);
      expect(el!.frame.width).toBe(600);
      expect(el!.frame.height).toBe(200);
    });

    it("enforces minimum width/height of 20px", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "resize_element",
          slideId: "slide-title",
          elementId: "el-title",
          width: 5,
          height: 10,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.width).toBeGreaterThanOrEqual(20);
      expect(el!.frame.height).toBeGreaterThanOrEqual(20);
    });

    it("clamps to slide bounds when resize would exceed", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "resize_element",
          slideId: "slide-title",
          elementId: "el-title",
          width: 2000,
          height: 1500,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame.width).toBeLessThanOrEqual(1280);
      expect(el!.frame.height).toBeLessThanOrEqual(720);
    });

    it("skips silently when elementId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "resize_element",
          slideId: "slide-title",
          elementId: "nonexistent",
          width: 600,
          height: 200,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title");
      expect(el!.frame).toEqual(presentationFixture.slides[0]!.elements[0]!.frame);
    });
  });

  describe("set_element_region", () => {
    it("moves element to region frame and updates contentRefs", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_region",
          slideId: "slide-text",
          elementId: "el-body",
          regionId: "body-region",
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const slide = next.slides.find((s) => s.id === "slide-text")!;
      const region = slide.layout.regions.find((r) => r.id === "body-region")!;
      const el = slide.elements.find((e) => e.id === "el-body");
      // Element frame should match region frame
      expect(el!.frame.x).toBe(region.frame.x);
      expect(el!.frame.y).toBe(region.frame.y);
      expect(region.contentRefs).toContain("el-body");
    });

    it("skips silently when regionId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_region",
          slideId: "slide-text",
          elementId: "el-body",
          regionId: "nonexistent-region",
        },
      ];

      // Should not throw
      const next = await applyOperations(presentationFixture, ops);
      const slide = next.slides.find((s) => s.id === "slide-text")!;
      const el = slide.elements.find((e) => e.id === "el-body");
      // Frame should be unchanged
      expect(el!.frame).toEqual(
        presentationFixture.slides.find((s) => s.id === "slide-text")!.elements[0]!.frame,
      );
    });
  });

  describe("update_element_style", () => {
    it("merges style properties into existing element style", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "update_element_style",
          slideId: "slide-title",
          elementId: "el-title",
          style: { fontSize: 32, color: "#FF0000" },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      const el = next.slides[0]!.elements.find((e) => e.id === "el-title")!;
      const style = (el as unknown as { style: Record<string, unknown> }).style;
      expect(style.fontSize).toBe(32);
      expect(style.color).toBe("#FF0000");
      // Original properties preserved
      expect(style.fontFamily).toBe("Arial");
    });

    it("skips silently when elementId is invalid", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "update_element_style",
          slideId: "slide-title",
          elementId: "nonexistent",
          style: { fontSize: 32 },
        },
      ];

      // Should not throw
      const next = await applyOperations(presentationFixture, ops);
      expect(next.slides).toHaveLength(presentationFixture.slides.length);
    });
  });

  describe("skipped operation observability", () => {
    it("records skipped for invalid slideId in set_element_frame", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "nonexistent-slide",
          elementId: "el-title",
          frame: { x: 100, y: 100, width: 200, height: 100 },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      expect(next.operationLog[0]?.result).toBe("skipped");
      expect(next.operationLog[0]?.error).toBe("slide_not_found");
    });

    it("records skipped for invalid elementId in move_element", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "move_element",
          slideId: "slide-title",
          elementId: "nonexistent",
          x: 100,
          y: 100,
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      expect(next.operationLog[0]?.result).toBe("skipped");
      expect(next.operationLog[0]?.error).toBe("element_not_found");
    });

    it("records skipped for invalid regionId in set_element_region", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_region",
          slideId: "slide-text",
          elementId: "el-body",
          regionId: "nonexistent-region",
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      expect(next.operationLog[0]?.result).toBe("skipped");
      expect(next.operationLog[0]?.error).toBe("region_not_found");
    });

    it("records success for valid set_element_frame", async () => {
      const ops: PresentationOperation[] = [
        {
          type: "set_element_frame",
          slideId: "slide-title",
          elementId: "el-title",
          frame: { x: 100, y: 100, width: 400, height: 100 },
        },
      ];

      const next = await applyOperations(presentationFixture, ops);
      expect(next.operationLog[0]?.result).toBe("success");
    });
  });

  describe("set_element_region reflow", () => {
    it("distributes elements when moving into populated region", async () => {
      // Create a fixture with two elements and one region
      const twoElementFixture = structuredClone(presentationFixture);
      const slide = twoElementFixture.slides.find((s) => s.id === "slide-text")!;
      // Add a second element
      slide.elements.push({
        id: "el-callout",
        type: "text",
        role: "callout",
        text: { paragraphs: [{ runs: [{ text: "Important note" }], alignment: "left" }] },
        frame: { x: 200, y: 500, width: 400, height: 100 },
        style: { fontFamily: "Arial", fontSize: 18, color: "#333333" },
      });

      const ops: PresentationOperation[] = [
        {
          type: "set_element_region",
          slideId: "slide-text",
          elementId: "el-callout",
          regionId: "body-region",
        },
      ];

      const next = await applyOperations(twoElementFixture, ops);
      const resultSlide = next.slides.find((s) => s.id === "slide-text")!;
      const region = resultSlide.layout.regions.find((r) => r.id === "body-region")!;
      const elBody = resultSlide.elements.find((e) => e.id === "el-body")!;
      const elCallout = resultSlide.elements.find((e) => e.id === "el-callout")!;

      // Both elements should be in the region's contentRefs
      expect(region.contentRefs).toContain("el-body");
      expect(region.contentRefs).toContain("el-callout");
      // Their frames should NOT be identical (reflow distributes them)
      expect(elBody.frame).not.toEqual(elCallout.frame);
      // Both frames should be within slide bounds
      expect(elBody.frame.x + elBody.frame.width).toBeLessThanOrEqual(1280);
      expect(elBody.frame.y + elBody.frame.height).toBeLessThanOrEqual(720);
      expect(elCallout.frame.x + elCallout.frame.width).toBeLessThanOrEqual(1280);
      expect(elCallout.frame.y + elCallout.frame.height).toBeLessThanOrEqual(720);
    });
  });

  describe("update_element_style deep merge", () => {
    it("preserves nested textStyle.color when updating textStyle.fontSize", async () => {
      // Set up element with nested style
      const fixture = structuredClone(presentationFixture);
      const el = fixture.slides[0]!.elements[0]!;
      (el as unknown as { style: Record<string, unknown> }).style = {
        textStyle: { fontSize: 14, color: "#000000" },
        borderColor: "#cccccc",
      };

      const ops: PresentationOperation[] = [
        {
          type: "update_element_style",
          slideId: "slide-title",
          elementId: "el-title",
          style: { textStyle: { fontSize: 12 } },
        },
      ];

      const next = await applyOperations(fixture, ops);
      const resultEl = next.slides[0]!.elements.find((e) => e.id === "el-title")!;
      const style = (resultEl as unknown as { style: Record<string, unknown> }).style;
      const textStyle = style.textStyle as Record<string, unknown>;
      expect(textStyle.fontSize).toBe(12);
      expect(textStyle.color).toBe("#000000");
      expect(style.borderColor).toBe("#cccccc");
    });

    it("replaces arrays rather than deep-merging them", async () => {
      const fixture = structuredClone(presentationFixture);
      const el = fixture.slides[0]!.elements[0]!;
      (el as unknown as { style: Record<string, unknown> }).style = {
        palette: ["#111", "#222", "#333"],
      };

      const ops: PresentationOperation[] = [
        {
          type: "update_element_style",
          slideId: "slide-title",
          elementId: "el-title",
          style: { palette: ["#AAA", "#BBB"] },
        },
      ];

      const next = await applyOperations(fixture, ops);
      const resultEl = next.slides[0]!.elements.find((e) => e.id === "el-title")!;
      const style = (resultEl as unknown as { style: Record<string, unknown> }).style;
      expect(style.palette).toEqual(["#AAA", "#BBB"]);
    });

    it("works when element has no existing style", async () => {
      const fixture = structuredClone(presentationFixture);
      const slide = fixture.slides.find((s) => s.id === "slide-image")!;
      const el = slide.elements[0]!;
      // Image elements may not have style
      delete (el as Record<string, unknown>).style;

      const ops: PresentationOperation[] = [
        {
          type: "update_element_style",
          slideId: "slide-image",
          elementId: "el-image",
          style: { opacity: 0.8 },
        },
      ];

      const next = await applyOperations(fixture, ops);
      const resultEl = next.slides.find((s) => s.id === "slide-image")!.elements[0]!;
      const style = (resultEl as unknown as { style: Record<string, unknown> }).style;
      expect(style.opacity).toBe(0.8);
    });
  });
});

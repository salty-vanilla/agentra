import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
import type { PresentationIR, ShapeElementIR, TextElementIR } from "#src/index.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("pptx exporter — Phase 4 shape & decoration", () => {
  it("renders a shape element via addShape", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const slide = presentation.slides[0];
    const shape: ShapeElementIR = {
      id: "el-shape",
      type: "shape",
      shapeType: "round_rect",
      frame: { x: 100, y: 100, width: 200, height: 100 },
      style: { fill: "#1D4ED8", stroke: "#0F172A", strokeWidth: 1, radius: 8 },
    };
    slide.elements.push(shape);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = await zip.file("ppt/slides/slide1.xml")?.async("string");

    // PptxGenJS encodes a roundRect shape via prstGeom prst="roundRect".
    expect(slide1).toContain('prst="roundRect"');
    // No "not supported" warning for shape elements.
    expect(result.warnings ?? []).not.toContain(
      expect.stringContaining("(shape) is not supported"),
    );
  });

  it("applies decoration card styling (fill from theme.surface) to a text element", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const slide = presentation.slides[0];
    const cardText: TextElementIR = {
      id: "el-card-text",
      type: "text",
      role: "body",
      frame: { x: 100, y: 100, width: 400, height: 200 },
      style: { fontFamily: "Arial", fontSize: 18 },
      text: { paragraphs: [{ runs: [{ text: "Card body" }] }] },
      decoration: { kind: "card" },
    };
    slide.elements.push(cardText);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = await zip.file("ppt/slides/slide1.xml")?.async("string");

    // theme.colors.surface = "#F8FAFC" (without leading '#'). PptxGenJS uses uppercase hex.
    expect(slide1?.toUpperCase()).toContain("F8FAFC");
  });
});

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
import type { ChartElementIR, DiagramElementIR, PresentationIR } from "#src/index.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("pptx exporter — Phase 5 chart & diagram", () => {
  it("emits a chart part for a bar chart element", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const chart: ChartElementIR = {
      id: "el-chart",
      type: "chart",
      chartType: "bar",
      frame: { x: 80, y: 320, width: 600, height: 280 },
      data: {
        series: [{ name: "FY25", values: [10, 20, 30, 40] }],
        categories: ["Q1", "Q2", "Q3", "Q4"],
      },
      encoding: {},
    };
    presentation.slides[0].elements.push(chart);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);

    const chartFiles = Object.keys(zip.files).filter((f) => f.startsWith("ppt/charts/chart"));
    expect(chartFiles.length).toBeGreaterThanOrEqual(1);

    expect(result.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("(chart) is not supported")]),
    );
  });

  it("emits node + edge shapes for a flowchart diagram", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const diagram: DiagramElementIR = {
      id: "el-flow",
      type: "diagram",
      diagramType: "flowchart",
      frame: { x: 80, y: 320, width: 800, height: 200 },
      nodes: [
        { id: "n1", label: "Discover" },
        { id: "n2", label: "Design" },
        { id: "n3", label: "Deliver" },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
      ],
    };
    presentation.slides[0].elements.push(diagram);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    // 3 round-rect node shapes
    const roundRectCount = (slide1.match(/prst="roundRect"/g) ?? []).length;
    expect(roundRectCount).toBeGreaterThanOrEqual(3);
    // 2 line shapes for explicit edges
    const lineCount = (slide1.match(/prst="line"/g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(2);
    // Node labels are placed as text
    expect(slide1).toContain("Discover");
    expect(slide1).toContain("Deliver");
  });
});

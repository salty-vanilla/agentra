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

  it("emits a chart part for a line chart with 2 series", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const chart: ChartElementIR = {
      id: "el-line-chart",
      type: "chart",
      chartType: "line",
      frame: { x: 80, y: 320, width: 600, height: 280 },
      data: {
        series: [
          { name: "Revenue", values: [100, 200, 300, 400] },
          { name: "Cost", values: [80, 150, 250, 350] },
        ],
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
  });

  it("renders a visible placeholder when chart data is empty", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const chart: ChartElementIR = {
      id: "el-empty-chart",
      type: "chart",
      chartType: "bar",
      frame: { x: 80, y: 320, width: 600, height: 280 },
      data: { series: [], categories: [] },
      encoding: {},
    };
    presentation.slides[0].elements.push(chart);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    expect(slide1).toContain("Chart data unavailable");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("el-empty-chart")]),
    );
  });

  it("emits node shapes for a flowchart with 4 nodes", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const diagram: DiagramElementIR = {
      id: "el-flow-4",
      type: "diagram",
      diagramType: "flowchart",
      frame: { x: 80, y: 320, width: 800, height: 200 },
      nodes: [
        { id: "n1", label: "Plan" },
        { id: "n2", label: "Build" },
        { id: "n3", label: "Test" },
        { id: "n4", label: "Deploy" },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
        { id: "e3", from: "n3", to: "n4" },
      ],
    };
    presentation.slides[0].elements.push(diagram);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    const roundRectCount = (slide1.match(/prst="roundRect"/g) ?? []).length;
    expect(roundRectCount).toBeGreaterThanOrEqual(4);
    const lineCount = (slide1.match(/prst="line"/g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(3);
  });

  it("emits node shapes for a timeline with 3 milestones", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const diagram: DiagramElementIR = {
      id: "el-timeline",
      type: "diagram",
      diagramType: "timeline",
      frame: { x: 80, y: 320, width: 800, height: 200 },
      nodes: [
        { id: "m1", label: "Phase 1" },
        { id: "m2", label: "Phase 2" },
        { id: "m3", label: "Phase 3" },
      ],
    };
    presentation.slides[0].elements.push(diagram);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    const roundRectCount = (slide1.match(/prst="roundRect"/g) ?? []).length;
    expect(roundRectCount).toBeGreaterThanOrEqual(3);
    // Timeline uses implicit edges (sequence diagram kind)
    const lineCount = (slide1.match(/prst="line"/g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(2);
  });

  it("emits stacked shapes for a layered diagram with 3 layers", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const diagram: DiagramElementIR = {
      id: "el-layered",
      type: "diagram",
      diagramType: "layered",
      frame: { x: 80, y: 320, width: 800, height: 200 },
      nodes: [
        { id: "l1", label: "Presentation" },
        { id: "l2", label: "Business Logic" },
        { id: "l3", label: "Data Access" },
      ],
    };
    presentation.slides[0].elements.push(diagram);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    const roundRectCount = (slide1.match(/prst="roundRect"/g) ?? []).length;
    expect(roundRectCount).toBeGreaterThanOrEqual(3);
    expect(slide1).toContain("Presentation");
    expect(slide1).toContain("Data Access");
  });

  it("renders a visible placeholder when diagram has no nodes", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    const diagram: DiagramElementIR = {
      id: "el-empty-diagram",
      type: "diagram",
      diagramType: "flowchart",
      frame: { x: 80, y: 320, width: 800, height: 200 },
      nodes: [],
    };
    presentation.slides[0].elements.push(diagram);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });
    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";

    expect(slide1).toContain("Diagram data unavailable");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("el-empty-diagram")]),
    );
  });
});

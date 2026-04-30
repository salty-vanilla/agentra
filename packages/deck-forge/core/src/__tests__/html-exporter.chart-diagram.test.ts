import { describe, expect, it } from "vitest";

import { HtmlExporter } from "#src/exporters/html/html-exporter.js";
import type { ChartElementIR, DiagramElementIR, PresentationIR } from "#src/index.js";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const SAMPLE_BAR: Omit<ChartElementIR, "id"> = {
  type: "chart",
  chartType: "bar",
  frame: { x: 80, y: 320, width: 600, height: 280 },
  data: {
    series: [
      { name: "FY24", values: [10, 20, 30, 40] },
      { name: "FY25", values: [15, 25, 28, 50] },
    ],
    categories: ["Q1", "Q2", "Q3", "Q4"],
  },
  encoding: { x: "quarter", y: "revenue" },
};

describe("html exporter — Phase 5 chart & diagram SVG", () => {
  it("renders a bar chart as inline SVG with a <rect> per data point", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    presentation.slides[0].elements.push({ id: "el-chart", ...SAMPLE_BAR });

    const exporter = new HtmlExporter();
    const html = (await exporter.export(presentation, { format: "html" })).data as string;

    expect(html).toContain("chart-element");
    expect(html).toContain("<svg");
    // 2 series × 4 categories = 8 bars (rect inside the chart svg)
    const rectMatches = html.match(/<rect[^>]*\/>/g) ?? [];
    expect(rectMatches.length).toBeGreaterThanOrEqual(8);
    // legend includes both series names
    expect(html).toContain("FY24");
    expect(html).toContain("FY25");
    // x-axis labels present
    expect(html).toContain("Q3");
  });

  it("renders a line chart with one polyline per series", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    presentation.slides[0].elements.push({
      id: "el-line",
      ...SAMPLE_BAR,
      chartType: "line",
    });

    const exporter = new HtmlExporter();
    const html = (await exporter.export(presentation, { format: "html" })).data as string;

    const polylineCount = (html.match(/<polyline /g) ?? []).length;
    expect(polylineCount).toBeGreaterThanOrEqual(2);
  });

  it("renders a pie chart with one <path> slice per value", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    presentation.slides[0].elements.push({
      id: "el-pie",
      type: "chart",
      chartType: "pie",
      frame: { x: 100, y: 200, width: 300, height: 300 },
      data: { series: [{ name: "Share", values: [40, 30, 20, 10] }] },
      encoding: {},
    });

    const exporter = new HtmlExporter();
    const html = (await exporter.export(presentation, { format: "html" })).data as string;

    const pathCount = (html.match(/<path d="/g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(4);
  });

  it("renders a horizontal flowchart diagram with arrows between nodes", async () => {
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

    const exporter = new HtmlExporter();
    const html = (await exporter.export(presentation, { format: "html" })).data as string;

    expect(html).toContain("diagram-element");
    expect(html).toContain("Discover");
    expect(html).toContain("Design");
    expect(html).toContain("Deliver");
    // 2 explicit edges → 2 <line> with arrow markers
    const lineMatches = html.match(/<line [^>]*marker-end=/g) ?? [];
    expect(lineMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("draws a cycle diagram with nodes positioned around a center", async () => {
    const presentation: PresentationIR = clone(presentationFixture);
    presentation.slides[0].elements.push({
      id: "el-cycle",
      type: "diagram",
      diagramType: "cycle",
      frame: { x: 100, y: 100, width: 500, height: 500 },
      nodes: Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, label: `Phase ${i + 1}` })),
    });

    const exporter = new HtmlExporter();
    const html = (await exporter.export(presentation, { format: "html" })).data as string;
    expect(html).toContain("Phase 1");
    expect(html).toContain("Phase 4");
  });
});

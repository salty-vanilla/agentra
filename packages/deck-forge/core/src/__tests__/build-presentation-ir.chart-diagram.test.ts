import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import type { DeckPlan, PresentationBrief, SlideSpec } from "#src/index.js";

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
    title: "Test Deck",
    audience: "executive",
    genre: "business-review",
    slides: [{ keyMessage: "Test", intent: "summarize", contentKinds: ["summary"] }],
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

describe("buildPresentationIr — ChartBlock → ChartElementIR", () => {
  it("converts a ChartBlock with valid data into a chart element", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "chart-1",
        type: "chart",
        chartType: "bar",
        data: {
          series: [{ name: "Revenue", values: [10, 20, 30] }],
          categories: ["Q1", "Q2", "Q3"],
        },
        encoding: { x: "category", y: "value" },
      },
    ]);
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });
    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    const chartEl = slide?.elements.find((e) => e.type === "chart");
    expect(chartEl).toBeDefined();
    expect(chartEl?.type).toBe("chart");
    if (chartEl?.type === "chart") {
      expect(chartEl.chartType).toBe("bar");
      expect(chartEl.data.series).toHaveLength(1);
      expect(chartEl.data.series[0].values).toEqual([10, 20, 30]);
      expect(chartEl.data.categories).toEqual(["Q1", "Q2", "Q3"]);
    }
  });

  it("converts a ChartBlock with empty series into a chart element", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "chart-empty",
        type: "chart",
        chartType: "line",
        data: { series: [] },
        encoding: {},
      },
    ]);
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });
    const slide = ir.slides[0];
    const chartEl = slide?.elements.find((e) => e.type === "chart");
    expect(chartEl).toBeDefined();
    expect(chartEl?.type).toBe("chart");
    if (chartEl?.type === "chart") {
      expect(chartEl.data.series).toHaveLength(0);
    }
  });
});

describe("buildPresentationIr — DiagramBlock → DiagramElementIR", () => {
  it("converts a DiagramBlock with nodes into a diagram element", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "diagram-1",
        type: "diagram",
        diagramType: "flowchart",
        nodes: [
          { id: "n1", label: "Start" },
          { id: "n2", label: "Process" },
          { id: "n3", label: "End" },
        ],
        edges: [
          { id: "e1", from: "n1", to: "n2" },
          { id: "e2", from: "n2", to: "n3" },
        ],
      },
    ]);
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });
    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    const diagramEl = slide?.elements.find((e) => e.type === "diagram");
    expect(diagramEl).toBeDefined();
    expect(diagramEl?.type).toBe("diagram");
    if (diagramEl?.type === "diagram") {
      expect(diagramEl.diagramType).toBe("flowchart");
      expect(diagramEl.nodes).toHaveLength(3);
      expect(diagramEl.edges).toHaveLength(2);
    }
  });

  it("converts a DiagramBlock with empty nodes into a diagram element", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "diagram-empty",
        type: "diagram",
        diagramType: "timeline",
        nodes: [],
      },
    ]);
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });
    const slide = ir.slides[0];
    const diagramEl = slide?.elements.find((e) => e.type === "diagram");
    expect(diagramEl).toBeDefined();
    expect(diagramEl?.type).toBe("diagram");
    if (diagramEl?.type === "diagram") {
      expect(diagramEl.nodes).toHaveLength(0);
    }
  });
});

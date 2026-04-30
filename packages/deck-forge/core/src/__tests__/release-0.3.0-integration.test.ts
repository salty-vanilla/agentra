import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import { HeuristicSlideDesigner } from "#src/design/heuristic-slide-designer.js";
import { HtmlExporter } from "#src/exporters/html/html-exporter.js";
import type {
  AssetSpec,
  DeckPlan,
  PresentationBrief,
  SlideImage,
  SlideImageRenderer,
  SlideSpec,
  VisualReviewer,
} from "#src/index.js";
import { runDesignReviewLoop } from "#src/runtime/design-review-loop.js";

function makeBrief(): PresentationBrief {
  return {
    id: "brief-int",
    title: "Integration Brief",
    audience: { primary: "Execs", expertiseLevel: "intermediate" },
    goal: { type: "inform", primaryGoal: "share insight" },
    tone: { register: "neutral", energy: "calm" },
    narrative: { framework: "scqa", steps: [] },
    output: { format: ["html", "pptx"] },
    constraints: { mustInclude: [], mustAvoid: [] },
    visualDirection: { style: "minimal", mood: "trustworthy" },
  } as unknown as PresentationBrief;
}

function makeDeckPlan(): DeckPlan {
  return {
    id: "deck-int",
    briefId: "brief-int",
    title: "Integration Deck",
    slideCountTarget: 1,
    sections: [],
    globalStoryline: "test",
  } as DeckPlan;
}

function makeSlideSpec(): SlideSpec {
  return {
    id: "slide-kpi",
    slideNumber: 1,
    title: "KPI Snapshot",
    intent: {
      type: "data_insight",
      keyMessage: "Q3 KPIs are strong across the board",
      audienceTakeaway: "We are tracking ahead of plan",
    },
    layout: { type: "single_column", density: "medium" },
    content: [
      { id: "block-title", type: "title", text: "Q3 KPI Snapshot" },
      {
        id: "block-metric-1",
        type: "metric",
        label: "Revenue",
        value: "12.3",
        unit: "M",
        trend: "up",
      },
      {
        id: "block-metric-2",
        type: "metric",
        label: "Active Users",
        value: "98k",
        trend: "up",
      },
      {
        id: "block-metric-3",
        type: "metric",
        label: "Churn",
        value: "1.8",
        unit: "%",
        trend: "down",
      },
    ],
  } as SlideSpec;
}

const NOOP_ASSETS: AssetSpec[] = [];

describe("0.3.0 integration — build → design → review loop → export", () => {
  it("propagates `card` decoration to metric elements via the IR builder", () => {
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec()],
      assetSpecs: NOOP_ASSETS,
    });

    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    if (!slide) throw new Error("expected first slide");
    const metricElements = slide.elements.filter(
      (e): e is Extract<typeof e, { type: "text" }> => e.type === "text" && e.id.includes("metric"),
    );
    expect(metricElements.length).toBeGreaterThanOrEqual(3);
    for (const el of metricElements) {
      expect(el.decoration).toEqual({ kind: "card" });
    }
  });

  it("end-to-end: HeuristicSlideDesigner + runDesignReviewLoop + HtmlExporter produce a deck with deco-card markup", async () => {
    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [makeSlideSpec()],
      assetSpecs: NOOP_ASSETS,
    });

    let renderCalls = 0;
    const renderer: SlideImageRenderer = {
      async render({ presentation }): Promise<SlideImage[]> {
        renderCalls += 1;
        return presentation.slides.map((s) => ({
          slideId: s.id,
          mimeType: "image/png",
          data: new Uint8Array([renderCalls]),
          source: "ir-html",
        }));
      },
    };

    const reviewer: VisualReviewer = {
      name: "converging-stub",
      async review() {
        // Converge immediately — no operations to apply.
        return { findings: [], operations: [] };
      },
    };

    const designer = new HeuristicSlideDesigner();

    const result = await runDesignReviewLoop({
      presentation: ir,
      designer,
      visualReviewer: reviewer,
      renderer,
      maxIterations: 2,
    });

    expect(result.stoppedReason).toBe("converged");
    expect(result.iterations.length).toBeGreaterThanOrEqual(1);
    expect(renderCalls).toBeGreaterThanOrEqual(1);

    // Designer should have set decoration on metric cards already → exporter
    // emits the corresponding CSS class.
    const html = (await new HtmlExporter().export(result.presentation, { format: "html" }))
      .data as string;
    expect(html).toContain("deco-card");
    // Title accent stripe + spacing tokens land in the global CSS.
    expect(html).toContain(".text-title::after");
    expect(html).toContain("--space-md:");
  });
});

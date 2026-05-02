import { describe, expect, it } from "vitest";

import {
  countByType,
  countBulletItems,
  hasActionPlanSignals,
  hasArchitectureSignals,
  hasCallout,
  hasChart,
  hasComplexVisuals,
  hasDecisionSignals,
  hasDiagram,
  hasRecommendationSignals,
  hasRoadmapSignals,
  hasTable,
  hasTrendSignals,
  isDataInsightIntent,
  isProcessIntent,
  isSummaryIntent,
  mergeAllRegions,
  mergeBodyVisualRegion,
  splitMainSidebar,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import {
  BUILTIN_LAYOUT_STRATEGIES,
  comparisonStrategy,
  dashboardStrategy,
  selectLayoutStrategy,
  singleStackStrategy,
  timelineStrategy,
} from "#src/builders/layouts/index.js";
import { actionPlanTableStrategy } from "#src/builders/layouts/action-plan-table.js";
import { dataInsightStoryStrategy } from "#src/builders/layouts/data-insight-story.js";
import { decisionRequestStrategy } from "#src/builders/layouts/decision-request.js";
import { executiveSummaryKpiStrategy } from "#src/builders/layouts/executive-summary-kpi.js";
import { implementationRoadmapStrategy } from "#src/builders/layouts/implementation-roadmap.js";
import { kpiDashboardWithInsightStrategy } from "#src/builders/layouts/kpi-dashboard-with-insight.js";
import { layeredArchitectureStrategy } from "#src/builders/layouts/layered-architecture.js";
import { oneMessageSummaryStrategy } from "#src/builders/layouts/one-message-summary.js";
import { optionComparisonTableStrategy } from "#src/builders/layouts/option-comparison-table.js";
import { processFlowWithImpactStrategy } from "#src/builders/layouts/process-flow-with-impact.js";
import { recommendationComparisonStrategy } from "#src/builders/layouts/recommendation-comparison.js";
import { smallMultiplesTrendStrategy } from "#src/builders/layouts/small-multiples-trend.js";
import { threePointSummaryStrategy } from "#src/builders/layouts/three-point-summary.js";
import type { LayoutContext } from "#src/builders/layouts/index.js";
import { MIN_SUBFRAME_HEIGHT } from "#src/builders/layouts/grid-utils.js";
import type { ContentBlock, SlideSpec, ThemeSpec } from "#src/index.js";
import { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSlideSpec(
  content: SlideSpec["content"],
  overrides: Partial<SlideSpec> = {},
): SlideSpec {
  return {
    id: "slide-1",
    slideNumber: 1,
    title: "Test Slide",
    intent: { type: "data_insight", keyMessage: "test", audienceTakeaway: "test" },
    layout: { type: "single_column", density: "medium" },
    content,
    ...overrides,
  } as SlideSpec;
}

function makeContext(
  blocks: ContentBlock[],
  overrides: Partial<Omit<LayoutContext, "slideSpec" | "layoutSpec">> & {
    layoutSpec?: Partial<LayoutContext["layoutSpec"]>;
    slideSpec?: Record<string, unknown>;
  } = {},
): LayoutContext {
  const { layoutSpec: layoutOverrides, slideSpec: slideOverrides, ...rest } = overrides;
  const slideSpec = makeSlideSpec(blocks, slideOverrides as Partial<SlideSpec>);
  if (layoutOverrides) {
    Object.assign(slideSpec.layout, layoutOverrides);
  }
  const ctx: LayoutContext = {
    slideSpec,
    layoutSpec: slideSpec.layout,
    regions: [],
    theme: {} as ThemeSpec,
    slideSize: { width: 1280, height: 720, unit: "px" },
    blocks,
    regionFrames: {
      body: { x: 80, y: 192, width: 672, height: 336 },
      visual: { x: 768, y: 192, width: 432, height: 336 },
      callout: { x: 80, y: 528, width: 1120, height: 112 },
      table: { x: 80, y: 192, width: 1120, height: 336 },
    },
    templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
    templateLayout: { id: "blank", name: "Blank", kind: "blank", slots: {} },
    templateSlots: {},
    ...rest,
  };
  return ctx;
}

function makeMetric(id: string, label: string, value: string): ContentBlock {
  return { id, type: "metric", label, value } as ContentBlock;
}

function makeCallout(id: string, text: string): ContentBlock {
  return { id, type: "callout", text } as ContentBlock;
}

function makeParagraph(id: string, text: string): ContentBlock {
  return { id, type: "paragraph", text } as ContentBlock;
}

function makeChart(id: string): ContentBlock {
  return {
    id,
    type: "chart",
    chartType: "line",
    data: { series: [{ name: "A", values: [1] }] },
    encoding: {},
  } as ContentBlock;
}

function makeTable(id: string): ContentBlock {
  return {
    id,
    type: "table",
    headers: ["Action", "Owner", "Status"],
    rows: [["Review", "Alice", "Done"]],
  } as ContentBlock;
}

function makeDiagram(id: string): ContentBlock {
  return {
    id,
    type: "diagram",
    diagramType: "flowchart",
    nodes: [{ id: "n1", label: "Start" }],
    edges: [],
  } as ContentBlock;
}

function makeBulletList(id: string, items: string[]): ContentBlock {
  return {
    id,
    type: "bullet_list",
    items: items.map((text) => ({ text })),
  } as ContentBlock;
}

// ---------------------------------------------------------------------------
// business-utils: signal detectors
// ---------------------------------------------------------------------------

describe("business-utils signal detectors", () => {
  it("countByType counts correct block types", () => {
    const blocks = [makeMetric("m1", "A", "1"), makeMetric("m2", "B", "2"), makeCallout("c1", "x")];
    expect(countByType(blocks, "metric")).toBe(2);
    expect(countByType(blocks, "callout")).toBe(1);
    expect(countByType(blocks, "chart")).toBe(0);
  });

  it("hasComplexVisuals detects table/chart/diagram", () => {
    expect(hasComplexVisuals([makeParagraph("p1", "text")])).toBe(false);
    expect(hasComplexVisuals([makeTable("t1")])).toBe(true);
    expect(hasComplexVisuals([makeChart("c1")])).toBe(true);
    expect(hasComplexVisuals([makeDiagram("d1")])).toBe(true);
  });

  it("hasCallout detects callout blocks", () => {
    expect(hasCallout([makeParagraph("p1", "text")])).toBe(false);
    expect(hasCallout([makeCallout("c1", "insight")])).toBe(true);
  });

  it("isSummaryIntent detects summary/closing/proposal", () => {
    const summaryCtx = makeContext([], {
      slideSpec: { intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" } },
    });
    expect(isSummaryIntent(summaryCtx)).toBe(true);

    const otherCtx = makeContext([], {
      slideSpec: { intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" } },
    });
    expect(isSummaryIntent(otherCtx)).toBe(false);
  });

  it("isProcessIntent detects process intent", () => {
    const ctx = makeContext([], {
      slideSpec: { intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" } },
    });
    expect(isProcessIntent(ctx)).toBe(true);
  });

  it("hasActionPlanSignals detects action plan keywords", () => {
    const ctx = makeContext([makeParagraph("p1", "Action Plan: assign owner and deadline")]);
    expect(hasActionPlanSignals(ctx)).toBe(true);

    const noSignal = makeContext([makeParagraph("p1", "General overview")]);
    expect(hasActionPlanSignals(noSignal)).toBe(false);
  });

  it("hasActionPlanSignals detects Japanese keywords", () => {
    const ctx = makeContext([], {
      slideSpec: { title: "アクション計画：担当者と期限" },
    });
    expect(hasActionPlanSignals(ctx)).toBe(true);
  });

  it("hasTrendSignals detects trend keywords", () => {
    const ctx = makeContext([], {
      slideSpec: { title: "Monthly Production Trend" },
    });
    expect(hasTrendSignals(ctx)).toBe(true);
  });

  it("countBulletItems counts across bullet lists", () => {
    const blocks = [makeBulletList("b1", ["a", "b", "c"])];
    expect(countBulletItems(blocks)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// business-utils: layout helpers
// ---------------------------------------------------------------------------

describe("business-utils layout helpers", () => {
  it("mergeBodyVisualRegion produces valid frame", () => {
    const ctx = makeContext([]);
    const frame = mergeBodyVisualRegion(ctx);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
    expect(frame.x).toBe(80);
    expect(frame.y).toBe(192);
  });

  it("mergeAllRegions includes callout region", () => {
    const ctx = makeContext([]);
    const frame = mergeAllRegions(ctx);
    // Should extend to bottom of callout (528 + 112 = 640)
    expect(frame.y + frame.height).toBe(640);
  });

  it("splitTopBottom produces non-overlapping frames", () => {
    const region = { x: 0, y: 0, width: 800, height: 400 };
    const { top, bottom } = splitTopBottom(region, 0.6, 16);
    expect(top.height).toBe(240);
    expect(bottom.y).toBe(256);
    expect(bottom.y).toBeGreaterThan(top.y + top.height);
  });

  it("splitMainSidebar produces non-overlapping frames", () => {
    const region = { x: 0, y: 0, width: 800, height: 400 };
    const { main, sidebar } = splitMainSidebar(region, 0.5, 16);
    expect(main.width).toBe(400);
    expect(sidebar.x).toBe(416);
    expect(sidebar.x).toBeGreaterThan(main.x + main.width);
  });
});

// ---------------------------------------------------------------------------
// executive-summary-kpi strategy
// ---------------------------------------------------------------------------

describe("executive-summary-kpi strategy", () => {
  it("matches when 3+ metrics + callout present", () => {
    const ctx = makeContext([
      makeMetric("m1", "OEE", "87%"),
      makeMetric("m2", "Yield", "94%"),
      makeMetric("m3", "Uptime", "98%"),
      makeCallout("c1", "Key takeaway: all metrics improved"),
    ]);
    expect(executiveSummaryKpiStrategy.match(ctx)).toBe(true);
  });

  it("matches when 3+ metrics + summary intent", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "OEE", "87%"),
        makeMetric("m2", "Yield", "94%"),
        makeMetric("m3", "Uptime", "98%"),
      ],
      { slideSpec: { intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(executiveSummaryKpiStrategy.match(ctx)).toBe(true);
  });

  it("does not match with fewer than 3 metrics", () => {
    const ctx = makeContext([
      makeMetric("m1", "OEE", "87%"),
      makeMetric("m2", "Yield", "94%"),
      makeCallout("c1", "insight"),
    ]);
    expect(executiveSummaryKpiStrategy.match(ctx)).toBe(false);
  });

  it("does not match when too many blocks", () => {
    const blocks: ContentBlock[] = [];
    for (let i = 0; i < 13; i++) {
      blocks.push(makeMetric(`m${i}`, `M${i}`, `${i}`));
    }
    const ctx = makeContext(blocks);
    expect(executiveSummaryKpiStrategy.match(ctx)).toBe(false);
  });

  it("layout produces non-zero frames for all blocks", () => {
    const blocks = [
      makeMetric("m1", "OEE", "87%"),
      makeMetric("m2", "Yield", "94%"),
      makeMetric("m3", "Uptime", "98%"),
      makeCallout("c1", "Key insight"),
    ];
    const ctx = makeContext(blocks);
    const assignments = executiveSummaryKpiStrategy.layout(ctx);
    expect(assignments).toHaveLength(4);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
    // All block IDs present
    const ids = assignments.map((a) => a.blockId);
    expect(ids).toContain("m1");
    expect(ids).toContain("m2");
    expect(ids).toContain("m3");
    expect(ids).toContain("c1");
  });

  it("metric cards have card decoration hints", () => {
    const blocks = [
      makeMetric("m1", "A", "1"),
      makeMetric("m2", "B", "2"),
      makeMetric("m3", "C", "3"),
      makeCallout("c1", "insight"),
    ];
    const ctx = makeContext(blocks);
    const assignments = executiveSummaryKpiStrategy.layout(ctx);
    const metricAssignments = assignments.filter((a) => a.blockId.startsWith("m"));
    for (const a of metricAssignments) {
      expect(a.hints?.decoration).toBe("card");
    }
  });
});

// ---------------------------------------------------------------------------
// kpi-dashboard-with-insight strategy
// ---------------------------------------------------------------------------

describe("kpi-dashboard-with-insight strategy", () => {
  it("matches when 2+ metrics + chart + insight present", () => {
    const ctx = makeContext([
      makeMetric("m1", "OEE", "87%"),
      makeMetric("m2", "Yield", "94%"),
      makeChart("ch1"),
      makeCallout("c1", "Key insight"),
    ]);
    expect(kpiDashboardWithInsightStrategy.match(ctx)).toBe(true);
  });

  it("matches when 2+ metrics + diagram + paragraph", () => {
    const ctx = makeContext([
      makeMetric("m1", "A", "1"),
      makeMetric("m2", "B", "2"),
      makeDiagram("d1"),
      makeParagraph("p1", "Insight text"),
    ]);
    expect(kpiDashboardWithInsightStrategy.match(ctx)).toBe(true);
  });

  it("does not match without chart or diagram", () => {
    const ctx = makeContext([
      makeMetric("m1", "A", "1"),
      makeMetric("m2", "B", "2"),
      makeCallout("c1", "insight"),
    ]);
    expect(kpiDashboardWithInsightStrategy.match(ctx)).toBe(false);
  });

  it("does not match without callout or paragraph", () => {
    const ctx = makeContext([
      makeMetric("m1", "A", "1"),
      makeMetric("m2", "B", "2"),
      makeChart("ch1"),
    ]);
    expect(kpiDashboardWithInsightStrategy.match(ctx)).toBe(false);
  });

  it("layout produces non-zero frames for all blocks", () => {
    const blocks = [
      makeMetric("m1", "OEE", "87%"),
      makeMetric("m2", "Yield", "94%"),
      makeChart("ch1"),
      makeCallout("c1", "Key insight"),
    ];
    const ctx = makeContext(blocks);
    const assignments = kpiDashboardWithInsightStrategy.layout(ctx);
    expect(assignments).toHaveLength(4);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// small-multiples-trend strategy
// ---------------------------------------------------------------------------

describe("small-multiples-trend strategy", () => {
  it("matches when 2+ charts + data_insight intent", () => {
    const ctx = makeContext(
      [makeChart("ch1"), makeChart("ch2"), makeCallout("c1", "Trend analysis")],
      { slideSpec: { intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(smallMultiplesTrendStrategy.match(ctx)).toBe(true);
  });

  it("matches when chart + 2 metrics + trend signals", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeMetric("m1", "Growth", "+5%"),
        makeMetric("m2", "YoY", "+12%"),
      ],
      { slideSpec: { title: "Monthly Production Trend" } },
    );
    expect(smallMultiplesTrendStrategy.match(ctx)).toBe(true);
  });

  it("does not match with only 1 chart and no metrics", () => {
    const ctx = makeContext(
      [makeChart("ch1"), makeCallout("c1", "insight")],
      { slideSpec: { intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(smallMultiplesTrendStrategy.match(ctx)).toBe(false);
  });

  it("does not match without data_insight intent or trend signals", () => {
    const ctx = makeContext([makeChart("ch1"), makeChart("ch2")], {
      slideSpec: { intent: { type: "comparison", keyMessage: "x", audienceTakeaway: "x" } },
    });
    expect(smallMultiplesTrendStrategy.match(ctx)).toBe(false);
  });

  it("layout produces non-zero frames for all blocks", () => {
    const blocks = [makeChart("ch1"), makeChart("ch2"), makeCallout("c1", "insight")];
    const ctx = makeContext(blocks, {
      slideSpec: { intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" } },
    });
    const assignments = smallMultiplesTrendStrategy.layout(ctx);
    expect(assignments).toHaveLength(3);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// process-flow-with-impact strategy
// ---------------------------------------------------------------------------

describe("process-flow-with-impact strategy", () => {
  it("matches when process intent + 3 blocks + callout", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Step 1: Input"),
        makeParagraph("p2", "Step 2: Process"),
        makeParagraph("p3", "Step 3: Output"),
        makeCallout("c1", "Impact: 30% reduction"),
      ],
      { slideSpec: { intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(processFlowWithImpactStrategy.match(ctx)).toBe(true);
  });

  it("matches when process intent + 3 blocks + metric", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Step A"),
        makeParagraph("p2", "Step B"),
        makeParagraph("p3", "Step C"),
        makeMetric("m1", "Impact", "-30%"),
      ],
      { slideSpec: { intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(processFlowWithImpactStrategy.match(ctx)).toBe(true);
  });

  it("does not match without process intent", () => {
    const ctx = makeContext([
      makeParagraph("p1", "A"),
      makeParagraph("p2", "B"),
      makeParagraph("p3", "C"),
      makeCallout("c1", "insight"),
    ]);
    expect(processFlowWithImpactStrategy.match(ctx)).toBe(false);
  });

  it("does not match with fewer than 3 blocks", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "A"), makeCallout("c1", "impact")],
      { slideSpec: { intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" } } },
    );
    expect(processFlowWithImpactStrategy.match(ctx)).toBe(false);
  });

  it("layout produces non-zero frames for all blocks", () => {
    const blocks = [
      makeParagraph("p1", "Step 1"),
      makeParagraph("p2", "Step 2"),
      makeParagraph("p3", "Step 3"),
      makeCallout("c1", "Impact: 30% reduction"),
    ];
    const ctx = makeContext(blocks, {
      slideSpec: { intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" } },
    });
    const assignments = processFlowWithImpactStrategy.layout(ctx);
    expect(assignments).toHaveLength(4);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// action-plan-table strategy
// ---------------------------------------------------------------------------

describe("action-plan-table strategy", () => {
  it("matches when action plan signals + table present", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Please approve the action plan"),
      ],
      { slideSpec: { title: "Action Plan: Q2 Follow-up Items" } },
    );
    expect(actionPlanTableStrategy.match(ctx)).toBe(true);
  });

  it("matches with Japanese action plan keywords", () => {
    const ctx = makeContext([makeTable("t1")], {
      slideSpec: { title: "アクション計画：担当者と期限" },
    });
    expect(actionPlanTableStrategy.match(ctx)).toBe(true);
  });

  it("does not match without table", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "Action plan items"), makeCallout("c1", "deadline")],
      { slideSpec: { title: "Action Plan" } },
    );
    expect(actionPlanTableStrategy.match(ctx)).toBe(false);
  });

  it("does not match without action plan signals", () => {
    const ctx = makeContext([makeTable("t1"), makeCallout("c1", "General overview")]);
    expect(actionPlanTableStrategy.match(ctx)).toBe(false);
  });

  it("does not match when too many blocks", () => {
    const blocks: ContentBlock[] = [makeTable("t1")];
    for (let i = 0; i < 8; i++) {
      blocks.push(makeParagraph(`p${i}`, `text ${i}`));
    }
    const ctx = makeContext(blocks, { slideSpec: { title: "Action Plan" } });
    expect(actionPlanTableStrategy.match(ctx)).toBe(false);
  });

  it("layout produces non-zero frames for all blocks", () => {
    const blocks = [
      makeTable("t1"),
      makeCallout("c1", "Please approve"),
    ];
    const ctx = makeContext(blocks, { slideSpec: { title: "Action Plan" } });
    const assignments = actionPlanTableStrategy.layout(ctx);
    expect(assignments).toHaveLength(2);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// Strategy precedence: business strategies override generic layout types
// ---------------------------------------------------------------------------

describe("strategy precedence", () => {
  /**
   * Build a strategy list that mirrors the production BUILTIN_LAYOUT_STRATEGIES
   * ordering but uses directly-imported strategies to avoid vitest module
   * re-export resolution issues.
   */
  const strategies = [
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority === 80),
    decisionRequestStrategy,
    recommendationComparisonStrategy,
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    dataInsightStoryStrategy,
    optionComparisonTableStrategy,
    processFlowWithImpactStrategy,
    implementationRoadmapStrategy,
    layeredArchitectureStrategy,
    oneMessageSummaryStrategy,
    threePointSummaryStrategy,
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority <= 70),
  ];

  it("executive-summary-kpi overrides dashboard when 4 metrics + summary intent + callout", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "OEE", "87%"),
        makeMetric("m2", "Yield", "94%"),
        makeMetric("m3", "Uptime", "98%"),
        makeMetric("m4", "Quality", "99.2%"),
        makeCallout("c1", "All KPIs improved this quarter"),
      ],
      {
        layoutSpec: { type: "dashboard", density: "medium" },
        slideSpec: { intent: { type: "summary", keyMessage: "KPI summary", audienceTakeaway: "x" } },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("executive-summary-kpi");
  });

  it("kpi-dashboard-with-insight overrides dashboard when metrics + chart + insight", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "OEE", "87%"),
        makeMetric("m2", "Yield", "94%"),
        makeChart("ch1"),
        makeCallout("c1", "Production efficiency improved"),
      ],
      { layoutSpec: { type: "dashboard", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("kpi-dashboard-with-insight");
  });

  it("action-plan-table overrides custom when action table signals present", () => {
    const ctx = makeContext(
      [makeTable("t1"), makeCallout("c1", "Owner: Tanaka, deadline: June")],
      {
        layoutSpec: { type: "custom", density: "medium" },
        slideSpec: { title: "Action Plan: Q2 Follow-up" },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("action-plan-table");
  });

  // --- Negative: generic strategies still win when no business signals ---

  it("generic dashboard is selected when only 2 metrics, no callout, no summary intent", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "A", "1"),
        makeMetric("m2", "B", "2"),
      ],
      { layoutSpec: { type: "dashboard", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("dashboard");
  });

  it("generic timeline is selected when no roadmap/action signals", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "Event A"), makeParagraph("p2", "Event B")],
      { layoutSpec: { type: "timeline", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("timeline");
  });

  it("generic comparison is selected when no recommendation signals", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Option A"),
        makeParagraph("p2", "Option B"),
      ],
      { layoutSpec: { type: "comparison", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("comparison");
  });
});

// ---------------------------------------------------------------------------
// Strategy registration order
// ---------------------------------------------------------------------------

describe("strategy registration", () => {
  it("business strategies have higher priority than generic layout strategies", () => {
    const businessStrategies = [
      actionPlanTableStrategy,
      dataInsightStoryStrategy,
      decisionRequestStrategy,
      executiveSummaryKpiStrategy,
      implementationRoadmapStrategy,
      kpiDashboardWithInsightStrategy,
      layeredArchitectureStrategy,
      oneMessageSummaryStrategy,
      optionComparisonTableStrategy,
      processFlowWithImpactStrategy,
      recommendationComparisonStrategy,
      smallMultiplesTrendStrategy,
      threePointSummaryStrategy,
    ];
    const genericStrategies = [comparisonStrategy, dashboardStrategy, timelineStrategy];

    for (const biz of businessStrategies) {
      for (const gen of genericStrategies) {
        expect(biz.priority).toBeGreaterThan(gen.priority);
      }
    }
  });

  it("most business strategies remain below title/section priority (80)", () => {
    // decision-request is intentionally elevated to 90 to win against action-plan-table
    // on approval slides that also have table blocks. title-slide / section-divider have
    // narrow match conditions so the priority inversion is safe in practice.
    const standardBusinessStrategies = [
      actionPlanTableStrategy,
      dataInsightStoryStrategy,
      executiveSummaryKpiStrategy,
      implementationRoadmapStrategy,
      kpiDashboardWithInsightStrategy,
      layeredArchitectureStrategy,
      oneMessageSummaryStrategy,
      optionComparisonTableStrategy,
      processFlowWithImpactStrategy,
      recommendationComparisonStrategy,
      smallMultiplesTrendStrategy,
      threePointSummaryStrategy,
    ];
    for (const biz of standardBusinessStrategies) {
      expect(biz.priority).toBeLessThan(80);
    }
    // decision-request is elevated above standard business strategies
    expect(decisionRequestStrategy.priority).toBeGreaterThan(actionPlanTableStrategy.priority);
  });

  it("standard business strategies have priority 75", () => {
    const bizStrategies = [
      actionPlanTableStrategy,
      dataInsightStoryStrategy,
      executiveSummaryKpiStrategy,
      implementationRoadmapStrategy,
      kpiDashboardWithInsightStrategy,
      layeredArchitectureStrategy,
      oneMessageSummaryStrategy,
      optionComparisonTableStrategy,
      processFlowWithImpactStrategy,
      recommendationComparisonStrategy,
      smallMultiplesTrendStrategy,
      threePointSummaryStrategy,
    ];
    for (const s of bizStrategies) {
      expect(s.priority).toBe(75);
    }
    // decision-request is elevated to 90 for Phase 7.6-fix
    expect(decisionRequestStrategy.priority).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Manufacturing report fixture tests
// ---------------------------------------------------------------------------

describe("manufacturing report expected strategy selection", () => {
  const strategies = [
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority === 80),
    decisionRequestStrategy,
    recommendationComparisonStrategy,
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    dataInsightStoryStrategy,
    optionComparisonTableStrategy,
    processFlowWithImpactStrategy,
    implementationRoadmapStrategy,
    layeredArchitectureStrategy,
    oneMessageSummaryStrategy,
    threePointSummaryStrategy,
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority <= 70),
  ];

  it("summary KPI slide selects executive-summary-kpi", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "OEE", "87.2%"),
        makeMetric("m2", "Yield Rate", "94.1%"),
        makeMetric("m3", "Equipment Uptime", "97.8%"),
        makeMetric("m4", "Defect Rate", "0.8%"),
        makeCallout("c1", "Overall manufacturing performance improved by 5% QoQ"),
      ],
      {
        layoutSpec: { type: "dashboard", density: "medium" },
        slideSpec: {
          title: "Manufacturing Performance Summary",
          intent: { type: "summary", keyMessage: "All KPIs improved", audienceTakeaway: "Manufacturing is on track" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("executive-summary-kpi");
  });

  it("KPI dashboard slide selects kpi-dashboard-with-insight", () => {
    const ctx = makeContext(
      [
        makeMetric("m1", "OEE", "87.2%"),
        makeMetric("m2", "Yield", "94.1%"),
        makeChart("ch1"),
        makeParagraph("p1", "Production efficiency shows steady improvement since Q1"),
      ],
      {
        layoutSpec: { type: "dashboard", density: "medium" },
        slideSpec: {
          title: "Production Dashboard",
          intent: { type: "data_insight", keyMessage: "Dashboard overview", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("kpi-dashboard-with-insight");
  });

  it("monthly trend slide selects small-multiples-trend", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeChart("ch2"),
        makeCallout("c1", "Upward trend across all production lines"),
      ],
      {
        layoutSpec: { type: "dashboard", density: "medium" },
        slideSpec: {
          title: "Monthly Production Trend",
          intent: { type: "data_insight", keyMessage: "Monthly trends", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("small-multiples-trend");
  });

  it("process flow slide selects process-flow-with-impact", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Raw Material Input"),
        makeParagraph("p2", "Quality Check"),
        makeParagraph("p3", "Assembly"),
        makeParagraph("p4", "Final Inspection"),
        makeMetric("m1", "Throughput Improvement", "+22%"),
      ],
      {
        layoutSpec: { type: "single_column", density: "medium" },
        slideSpec: {
          title: "Manufacturing Process Flow",
          intent: { type: "process", keyMessage: "Process overview", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("process-flow-with-impact");
  });

  it("action plan slide selects action-plan-table", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "All items due by end of Q2"),
      ],
      {
        layoutSpec: { type: "single_column", density: "medium" },
        slideSpec: {
          title: "Action Plan: Production Improvement Items",
          intent: { type: "proposal", keyMessage: "Action items", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("action-plan-table");
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-2: decision-request
// ---------------------------------------------------------------------------

describe("decision-request strategy", () => {
  it("matches when decision signals and >= 2 blocks", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Approval required: proceed with vendor A"),
        makeParagraph("p1", "Cost analysis supports this decision"),
      ],
      {
        slideSpec: {
          title: "Decision: Vendor Selection",
          intent: { type: "decision", keyMessage: "Approve vendor A", audienceTakeaway: "x" },
        },
      },
    );
    expect(decisionRequestStrategy.match(ctx)).toBe(true);
  });

  it("matches via keyword signals even without decision intent", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "承認依頼: 新規ライン投資"),
        makeParagraph("p1", "投資回収期間は18ヶ月"),
      ],
      {
        slideSpec: {
          title: "承認依頼",
          intent: { type: "proposal", keyMessage: "投資承認", audienceTakeaway: "x" },
        },
      },
    );
    expect(decisionRequestStrategy.match(ctx)).toBe(true);
  });

  it("rejects when fewer than 2 blocks", () => {
    const ctx = makeContext(
      [makeCallout("c1", "Approval needed")],
      {
        slideSpec: {
          title: "Decision",
          intent: { type: "decision", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(decisionRequestStrategy.match(ctx)).toBe(false);
  });

  it("rejects when more than 10 blocks", () => {
    const blocks = Array.from({ length: 11 }, (_, i) =>
      makeParagraph(`p${i}`, "Decision point"),
    );
    const ctx = makeContext(blocks, {
      slideSpec: {
        title: "Decision",
        intent: { type: "decision", keyMessage: "x", audienceTakeaway: "x" },
      },
    });
    expect(decisionRequestStrategy.match(ctx)).toBe(false);
  });

  it("rejects when no decision signals and no decision intent", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "General overview"),
        makeParagraph("p2", "More details"),
      ],
      {
        slideSpec: {
          title: "Status Update",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(decisionRequestStrategy.match(ctx)).toBe(false);
  });

  it("layout assigns decision callout with prominent hints", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Approve budget increase of $2M"),
        makeParagraph("p1", "ROI projected at 35%"),
        makeMetric("m1", "Payback Period", "14 months"),
      ],
      {
        slideSpec: {
          title: "Budget Approval Request",
          intent: { type: "decision", keyMessage: "Approve budget", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = decisionRequestStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // Decision callout should have prominent hints
    const decisionAssignment = assignments.find((a) => a.blockId === "c1");
    expect(decisionAssignment).toBeDefined();
    expect(decisionAssignment!.hints?.fontScale).toBe(1.4);
    expect(decisionAssignment!.hints?.role).toBe("callout");
    expect(decisionAssignment!.hints?.decoration).toBe("accent-bar");

    // All frames within bounds
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });

  it("layout handles no-callout case (first block gets decision treatment)", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "We need to decide on the next steps"),
        makeParagraph("p2", "Option analysis"),
      ],
      {
        slideSpec: {
          title: "Next Step Decision",
          intent: { type: "decision", keyMessage: "Decide", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = decisionRequestStrategy.layout(ctx);
    expect(assignments.length).toBe(2);

    // First block gets decision treatment
    expect(assignments[0]!.hints?.fontScale).toBe(1.4);
    expect(assignments[0]!.hints?.role).toBe("callout");
  });

  // --- Phase 7.6-fix D: approval-with-kpi-sidecar slot tests ---

  function makeApprovalCtx(blocks: import("#src/index.js").ContentBlock[]) {
    return makeContext(blocks, {
      slideSpec: {
        title: "施策承認をお願いします",
        intent: { type: "decision", keyMessage: "承認", audienceTakeaway: "x" },
      },
      templateSlots: {
        cta: { x: 80, y: 150, width: 1120, height: 80 },
        main: { x: 80, y: 260, width: 560, height: 300 },
        metrics: { x: 680, y: 260, width: 520, height: 160 },
        supporting: { x: 680, y: 445, width: 520, height: 115 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    });
  }

  it("matches Japanese approval keywords (承認事項, 施策承認)", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "施策承認をお願いします"),
      makeParagraph("p1", "投資回収期間は18ヶ月"),
    ]);
    expect(decisionRequestStrategy.match(ctx)).toBe(true);
  });

  it("matches with table block present + decision signal", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeTable("t1"),
      makeParagraph("p1", "詳細説明"),
    ]);
    expect(decisionRequestStrategy.match(ctx)).toBe(true);
  });

  it("layout uses cta slot for callout when cta slot exists", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeMetric("m1", "投資額", "¥200M"),
      makeParagraph("p1", "承認後に実施"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);

    const ctaAssignment = assignments.find((a) => a.blockId === "c1");
    expect(ctaAssignment?.slot).toBe("cta");
  });

  it("layout uses metrics slot for metric blocks when metrics slot exists", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeMetric("m1", "ROI", "35%"),
      makeMetric("m2", "回収期間", "14ヶ月"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);

    const metricAssignments = assignments.filter(
      (a) => a.blockId === "m1" || a.blockId === "m2",
    );
    for (const a of metricAssignments) {
      expect(a.slot).toBe("metrics");
    }
  });

  it("layout uses supporting slot for paragraph blocks when supporting slot exists", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeParagraph("p1", "承認後の実施事項"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);

    const pAssignment = assignments.find((a) => a.blockId === "p1");
    expect(pAssignment?.slot).toBe("supporting");
  });

  it("table block does NOT produce a table fallback slot", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeTable("t1"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);

    for (const a of assignments) {
      expect(a.fallbackSlots ?? []).not.toContain("table");
    }
  });

  it("table block goes to main slot (not table slot)", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeTable("t1"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);

    const tableAssignment = assignments.find((a) => a.blockId === "t1");
    expect(tableAssignment).toBeDefined();
    expect(tableAssignment?.slot).toBe("main");
  });

  it("priority is higher than action-plan-table", () => {
    expect(decisionRequestStrategy.priority).toBeGreaterThan(actionPlanTableStrategy.priority);
  });

  it("all slots produce non-zero frames", () => {
    const ctx = makeApprovalCtx([
      makeCallout("c1", "承認依頼"),
      makeTable("t1"),
      makeMetric("m1", "ROI", "35%"),
      makeParagraph("p1", "補足"),
    ]);
    const assignments = decisionRequestStrategy.layout(ctx);
    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-2: data-insight-story
// ---------------------------------------------------------------------------

describe("data-insight-story strategy", () => {
  it("matches with chart + callout + data_insight intent", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeCallout("c1", "Revenue grew 15% YoY driven by APAC expansion"),
      ],
      {
        slideSpec: {
          title: "Revenue Analysis",
          intent: { type: "data_insight", keyMessage: "Revenue growth", audienceTakeaway: "x" },
        },
      },
    );
    expect(dataInsightStoryStrategy.match(ctx)).toBe(true);
  });

  it("matches with table + 2 paragraphs + data_insight intent", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeParagraph("p1", "Key finding: defect rate down 30%"),
        makeParagraph("p2", "Root cause: improved inspection process"),
      ],
      {
        slideSpec: {
          title: "Quality Insight",
          intent: { type: "data_insight", keyMessage: "Defect reduction", audienceTakeaway: "x" },
        },
      },
    );
    expect(dataInsightStoryStrategy.match(ctx)).toBe(true);
  });

  it("rejects without data_insight intent", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeCallout("c1", "Important point"),
      ],
      {
        slideSpec: {
          title: "Overview",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(dataInsightStoryStrategy.match(ctx)).toBe(false);
  });

  it("rejects without chart or table", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "An insight"),
        makeParagraph("p1", "More context"),
      ],
      {
        slideSpec: {
          title: "Insight",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(dataInsightStoryStrategy.match(ctx)).toBe(false);
  });

  it("rejects with insufficient insight blocks", () => {
    const ctx = makeContext(
      [makeChart("ch1")],
      {
        slideSpec: {
          title: "Chart Only",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(dataInsightStoryStrategy.match(ctx)).toBe(false);
  });

  it("layout splits visual top / insight bottom", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeCallout("c1", "Key finding"),
        makeParagraph("p1", "Supporting detail"),
      ],
      {
        slideSpec: {
          title: "Analysis",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = dataInsightStoryStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // Chart should be above insight blocks
    const chartFrame = assignments.find((a) => a.blockId === "ch1")!.frame;
    const calloutFrame = assignments.find((a) => a.blockId === "c1")!.frame;
    expect(chartFrame.y).toBeLessThan(calloutFrame.y);

    // First insight block gets accent-bar and fontScale
    const calloutAssignment = assignments.find((a) => a.blockId === "c1");
    expect(calloutAssignment!.hints?.decoration).toBe("accent-bar");

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-2: recommendation-comparison
// ---------------------------------------------------------------------------

describe("recommendation-comparison strategy", () => {
  it("matches with recommendation signals + table", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Recommended: Option B for cost efficiency"),
      ],
      {
        slideSpec: {
          title: "Vendor Comparison — Recommendation",
          intent: { type: "comparison", keyMessage: "Recommend B", audienceTakeaway: "x" },
        },
      },
    );
    expect(recommendationComparisonStrategy.match(ctx)).toBe(true);
  });

  it("matches with Japanese recommendation signals", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "推奨案: プランBを採用"),
      ],
      {
        slideSpec: {
          title: "比較検討結果",
          intent: { type: "comparison", keyMessage: "推奨", audienceTakeaway: "x" },
        },
      },
    );
    expect(recommendationComparisonStrategy.match(ctx)).toBe(true);
  });

  it("matches with recommendation signals + comparison intent (no table)", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Option A: $100K"),
        makeParagraph("p2", "Option B: $80K — recommended"),
      ],
      {
        slideSpec: {
          title: "Cost Comparison",
          intent: { type: "comparison", keyMessage: "Compare options", audienceTakeaway: "x" },
        },
      },
    );
    expect(recommendationComparisonStrategy.match(ctx)).toBe(true);
  });

  it("rejects without recommendation signals", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeParagraph("p1", "General comparison"),
      ],
      {
        slideSpec: {
          title: "Options",
          intent: { type: "comparison", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(recommendationComparisonStrategy.match(ctx)).toBe(false);
  });

  it("rejects without table or comparison intent", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Our recommendation is clear"),
      ],
      {
        slideSpec: {
          title: "Recommendation",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(recommendationComparisonStrategy.match(ctx)).toBe(false);
  });

  it("layout splits main/sidebar with recommendation callout", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Recommended: Option B"),
        makeParagraph("p1", "Risk: integration timeline"),
      ],
      {
        slideSpec: {
          title: "Vendor Recommendation",
          intent: { type: "comparison", keyMessage: "Recommend B", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = recommendationComparisonStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // Callout in sidebar with recommendation hints
    const calloutAssignment = assignments.find((a) => a.blockId === "c1");
    expect(calloutAssignment!.hints?.decoration).toBe("accent-bar");
    expect(calloutAssignment!.hints?.role).toBe("callout");
    expect(calloutAssignment!.hints?.fontScale).toBe(1.1);

    // Table should be in main region (left side)
    const tableFrame = assignments.find((a) => a.blockId === "t1")!.frame;
    const calloutFrame = calloutAssignment!.frame;
    expect(tableFrame.x).toBeLessThan(calloutFrame.x);

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-2: option-comparison-table
// ---------------------------------------------------------------------------

describe("option-comparison-table strategy", () => {
  it("matches with table + comparison intent", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Option A is cost-effective"),
      ],
      {
        slideSpec: {
          title: "Option Comparison",
          intent: { type: "comparison", keyMessage: "Compare", audienceTakeaway: "x" },
        },
      },
    );
    expect(optionComparisonTableStrategy.match(ctx)).toBe(true);
  });

  it("rejects without comparison intent", () => {
    const ctx = makeContext(
      [makeTable("t1")],
      {
        slideSpec: {
          title: "Data Table",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(optionComparisonTableStrategy.match(ctx)).toBe(false);
  });

  it("rejects without table", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "Option A vs B")],
      {
        slideSpec: {
          title: "Comparison",
          intent: { type: "comparison", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(optionComparisonTableStrategy.match(ctx)).toBe(false);
  });

  it("rejects when more than 8 blocks", () => {
    const blocks = [
      makeTable("t1"),
      ...Array.from({ length: 8 }, (_, i) => makeParagraph(`p${i}`, "x")),
    ];
    const ctx = makeContext(blocks, {
      slideSpec: {
        title: "Comparison",
        intent: { type: "comparison", keyMessage: "x", audienceTakeaway: "x" },
      },
    });
    expect(optionComparisonTableStrategy.match(ctx)).toBe(false);
  });

  it("layout places table top and summary bottom", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Option A wins on cost, Option B on quality"),
      ],
      {
        slideSpec: {
          title: "Feature Comparison",
          intent: { type: "comparison", keyMessage: "Compare", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = optionComparisonTableStrategy.layout(ctx);
    expect(assignments.length).toBe(2);

    // Table above summary
    const tableFrame = assignments.find((a) => a.blockId === "t1")!.frame;
    const summaryFrame = assignments.find((a) => a.blockId === "c1")!.frame;
    expect(tableFrame.y).toBeLessThan(summaryFrame.y);

    // Summary has card decoration
    const summaryAssignment = assignments.find((a) => a.blockId === "c1");
    expect(summaryAssignment!.hints?.decoration).toBe("card");
    expect(summaryAssignment!.hints?.role).toBe("callout");

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });

  it("layout handles table-only case", () => {
    const ctx = makeContext(
      [makeTable("t1")],
      {
        slideSpec: {
          title: "Comparison",
          intent: { type: "comparison", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = optionComparisonTableStrategy.layout(ctx);
    expect(assignments.length).toBe(1);
    expect(assignments[0]!.frame.width).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-2: precedence tests
// ---------------------------------------------------------------------------

describe("6A-2 strategy precedence", () => {
  const strategies = [
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority === 80),
    decisionRequestStrategy,
    recommendationComparisonStrategy,
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    dataInsightStoryStrategy,
    optionComparisonTableStrategy,
    processFlowWithImpactStrategy,
    implementationRoadmapStrategy,
    layeredArchitectureStrategy,
    oneMessageSummaryStrategy,
    threePointSummaryStrategy,
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority <= 70),
  ];

  it("decision-request overrides generic dashboard with decision signals", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Approval needed for budget allocation"),
        makeParagraph("p1", "Projected savings: $500K"),
        makeMetric("m1", "ROI", "35%"),
      ],
      {
        layoutSpec: { type: "dashboard", density: "medium" },
        slideSpec: {
          title: "Budget Decision",
          intent: { type: "decision", keyMessage: "Approve budget", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("decision-request");
  });

  it("recommendation-comparison overrides generic comparison with recommendation signals", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeCallout("c1", "Recommended: Vendor B"),
      ],
      {
        layoutSpec: { type: "comparison", density: "medium" },
        slideSpec: {
          title: "Vendor Recommendation",
          intent: { type: "comparison", keyMessage: "Recommend B", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("recommendation-comparison");
  });

  it("data-insight-story selected for chart + insight + data_insight intent", () => {
    const ctx = makeContext(
      [
        makeChart("ch1"),
        makeCallout("c1", "Key insight: conversion improved 20%"),
        makeParagraph("p1", "Driven by UX redesign"),
      ],
      {
        layoutSpec: { type: "single_column", density: "medium" },
        slideSpec: {
          title: "Conversion Analysis",
          intent: { type: "data_insight", keyMessage: "Conversion up", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("data-insight-story");
  });

  it("option-comparison-table selected for table + comparison intent", () => {
    const ctx = makeContext(
      [
        makeTable("t1"),
        makeParagraph("p1", "Summary of options"),
      ],
      {
        layoutSpec: { type: "comparison", density: "medium" },
        slideSpec: {
          title: "Platform Comparison",
          intent: { type: "comparison", keyMessage: "Compare platforms", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("option-comparison-table");
  });

  it("generic comparison still selected when no business signals match", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Option A"),
        makeParagraph("p2", "Option B"),
      ],
      { layoutSpec: { type: "comparison", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("comparison");
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-3: one-message-summary
// ---------------------------------------------------------------------------

describe("one-message-summary strategy", () => {
  it("matches with summary intent + callout + no complex visuals", () => {
    const ctx = makeContext(
      [makeCallout("c1", "Our key takeaway: efficiency improved 20%")],
      {
        slideSpec: {
          title: "Summary",
          intent: { type: "summary", keyMessage: "Efficiency improved", audienceTakeaway: "x" },
        },
      },
    );
    expect(oneMessageSummaryStrategy.match(ctx)).toBe(true);
  });

  it("matches with closing intent + paragraph", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Thank you for your attention"),
        makeMetric("m1", "Next Review", "Q3 2026"),
      ],
      {
        slideSpec: {
          title: "Closing",
          intent: { type: "closing", keyMessage: "Thank you", audienceTakeaway: "x" },
        },
      },
    );
    expect(oneMessageSummaryStrategy.match(ctx)).toBe(true);
  });

  it("rejects when complex visuals present", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Key point"),
        makeChart("ch1"),
      ],
      {
        slideSpec: {
          title: "Summary",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(oneMessageSummaryStrategy.match(ctx)).toBe(false);
  });

  it("rejects when more than 4 blocks", () => {
    const blocks = Array.from({ length: 5 }, (_, i) =>
      makeParagraph(`p${i}`, "Point"),
    );
    const ctx = makeContext(blocks, {
      slideSpec: {
        title: "Summary",
        intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
      },
    });
    expect(oneMessageSummaryStrategy.match(ctx)).toBe(false);
  });

  it("rejects without summary intent", () => {
    const ctx = makeContext(
      [makeCallout("c1", "Important")],
      {
        slideSpec: {
          title: "Overview",
          intent: { type: "data_insight", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(oneMessageSummaryStrategy.match(ctx)).toBe(false);
  });

  it("layout gives dominant callout full region when single block", () => {
    const ctx = makeContext(
      [makeCallout("c1", "Key takeaway")],
      {
        slideSpec: {
          title: "Summary",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = oneMessageSummaryStrategy.layout(ctx);
    expect(assignments.length).toBe(1);
    expect(assignments[0]!.hints?.fontScale).toBe(1.3);
    expect(assignments[0]!.hints?.alignment).toBe("center");
    expect(assignments[0]!.hints?.role).toBe("callout");
  });

  it("layout splits key message top / supporting cards bottom", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Main message"),
        makeMetric("m1", "Growth", "+15%"),
        makeParagraph("p1", "Next steps planned"),
      ],
      {
        slideSpec: {
          title: "Summary",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = oneMessageSummaryStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // Key message above supporting cards
    const msgFrame = assignments.find((a) => a.blockId === "c1")!.frame;
    const cardFrame = assignments.find((a) => a.blockId === "m1")!.frame;
    expect(msgFrame.y).toBeLessThan(cardFrame.y);

    // Support blocks have card decoration
    expect(assignments.find((a) => a.blockId === "m1")!.hints?.decoration).toBe("card");

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-3: three-point-summary
// ---------------------------------------------------------------------------

describe("three-point-summary strategy", () => {
  it("matches with exactly 3 body blocks and no complex visuals", () => {
    const ctx = makeContext([
      makeParagraph("p1", "Point one"),
      makeParagraph("p2", "Point two"),
      makeParagraph("p3", "Point three"),
    ]);
    expect(threePointSummaryStrategy.match(ctx)).toBe(true);
  });

  it("matches with 3 callout + metric mix", () => {
    const ctx = makeContext([
      makeCallout("c1", "Pillar 1"),
      makeCallout("c2", "Pillar 2"),
      makeMetric("m1", "Growth", "+10%"),
    ]);
    expect(threePointSummaryStrategy.match(ctx)).toBe(true);
  });

  it("matches with bullet_list of exactly 3 items", () => {
    const ctx = makeContext([
      makeBulletList("b1", ["First", "Second", "Third"]),
    ]);
    expect(threePointSummaryStrategy.match(ctx)).toBe(true);
  });

  it("rejects with complex visuals", () => {
    const ctx = makeContext([
      makeParagraph("p1", "Point one"),
      makeParagraph("p2", "Point two"),
      makeChart("ch1"),
    ]);
    expect(threePointSummaryStrategy.match(ctx)).toBe(false);
  });

  it("rejects with 2 body blocks", () => {
    const ctx = makeContext([
      makeParagraph("p1", "Point one"),
      makeParagraph("p2", "Point two"),
    ]);
    expect(threePointSummaryStrategy.match(ctx)).toBe(false);
  });

  it("rejects with more than 5 blocks", () => {
    const blocks = Array.from({ length: 6 }, (_, i) =>
      makeParagraph(`p${i}`, "Point"),
    );
    const ctx = makeContext(blocks);
    expect(threePointSummaryStrategy.match(ctx)).toBe(false);
  });

  it("layout creates 3 horizontal cards", () => {
    const ctx = makeContext([
      makeParagraph("p1", "Pillar A"),
      makeCallout("c1", "Pillar B"),
      makeMetric("m1", "Pillar C", "100"),
    ]);
    const assignments = threePointSummaryStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // All should have card decoration
    for (const a of assignments) {
      expect(a.hints?.decoration).toBe("card");
      expect(a.hints?.alignment).toBe("center");
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });

  it("layout handles bullet_list block", () => {
    const ctx = makeContext([
      makeBulletList("b1", ["First", "Second", "Third"]),
    ]);
    const assignments = threePointSummaryStrategy.layout(ctx);
    expect(assignments.length).toBe(1);
    expect(assignments[0]!.hints?.decoration).toBe("card");
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-3: implementation-roadmap
// ---------------------------------------------------------------------------

describe("implementation-roadmap strategy", () => {
  it("matches with roadmap signals", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Phase 1: Planning"),
        makeParagraph("p2", "Phase 2: Development"),
        makeParagraph("p3", "Phase 3: Launch"),
      ],
      {
        slideSpec: {
          title: "Implementation Roadmap",
          intent: { type: "timeline", keyMessage: "3-phase rollout", audienceTakeaway: "x" },
        },
      },
    );
    expect(implementationRoadmapStrategy.match(ctx)).toBe(true);
  });

  it("matches with Japanese roadmap signals", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "フェーズ1"),
        makeParagraph("p2", "フェーズ2"),
        makeParagraph("p3", "フェーズ3"),
      ],
      {
        slideSpec: {
          title: "ロードマップ",
          intent: { type: "timeline", keyMessage: "展開計画", audienceTakeaway: "x" },
        },
      },
    );
    expect(implementationRoadmapStrategy.match(ctx)).toBe(true);
  });

  it("matches with timeline intent + enough content", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Step 1"),
        makeParagraph("p2", "Step 2"),
        makeBulletList("b1", ["task a", "task b"]),
      ],
      {
        slideSpec: {
          title: "Project Timeline",
          intent: { type: "timeline", keyMessage: "Timeline", audienceTakeaway: "x" },
        },
      },
    );
    expect(implementationRoadmapStrategy.match(ctx)).toBe(true);
  });

  it("rejects timeline intent without enough content", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "Just one step")],
      {
        slideSpec: {
          title: "Timeline",
          intent: { type: "timeline", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(implementationRoadmapStrategy.match(ctx)).toBe(false);
  });

  it("rejects when more than 10 blocks", () => {
    const blocks = Array.from({ length: 11 }, (_, i) =>
      makeParagraph(`p${i}`, "Phase"),
    );
    const ctx = makeContext(blocks, {
      slideSpec: {
        title: "Roadmap",
        intent: { type: "timeline", keyMessage: "x", audienceTakeaway: "x" },
      },
    });
    expect(implementationRoadmapStrategy.match(ctx)).toBe(false);
  });

  it("rejects without roadmap signals or timeline intent", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Step 1"),
        makeParagraph("p2", "Step 2"),
        makeParagraph("p3", "Step 3"),
      ],
      {
        slideSpec: {
          title: "Process Steps",
          intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(implementationRoadmapStrategy.match(ctx)).toBe(false);
  });

  it("layout creates horizontal phase cards + risk band", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Phase 1: Design"),
        makeParagraph("p2", "Phase 2: Build"),
        makeParagraph("p3", "Phase 3: Deploy"),
        makeCallout("c1", "Risk: resource constraints in Q3"),
      ],
      {
        slideSpec: {
          title: "Implementation Roadmap",
          intent: { type: "timeline", keyMessage: "Roadmap", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = implementationRoadmapStrategy.layout(ctx);
    expect(assignments.length).toBe(4);

    // Phase blocks should have card decoration
    const phaseAssignments = assignments.filter((a) => a.blockId.startsWith("p"));
    for (const a of phaseAssignments) {
      expect(a.hints?.decoration).toBe("card");
    }

    // Callout should have accent-bar
    const riskAssignment = assignments.find((a) => a.blockId === "c1");
    expect(riskAssignment!.hints?.decoration).toBe("accent-bar");
    expect(riskAssignment!.hints?.role).toBe("callout");

    // Phase cards above risk band
    const phaseMaxY = Math.max(...phaseAssignments.map((a) => a.frame.y));
    expect(riskAssignment!.frame.y).toBeGreaterThan(phaseMaxY);

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-3: layered-architecture
// ---------------------------------------------------------------------------

describe("layered-architecture strategy", () => {
  it("matches with architecture signals + diagram", () => {
    const ctx = makeContext(
      [
        makeDiagram("d1"),
        makeCallout("c1", "Design principle: loose coupling"),
      ],
      {
        slideSpec: {
          title: "System Architecture",
          intent: { type: "architecture", keyMessage: "Architecture overview", audienceTakeaway: "x" },
        },
      },
    );
    expect(layeredArchitectureStrategy.match(ctx)).toBe(true);
  });

  it("matches with architecture keywords + bullet items", () => {
    const ctx = makeContext(
      [
        makeBulletList("b1", ["Frontend Layer", "API Layer", "Data Layer"]),
        makeCallout("c1", "Microservice architecture"),
      ],
      {
        slideSpec: {
          title: "Technology Stack",
          intent: { type: "architecture", keyMessage: "Stack overview", audienceTakeaway: "x" },
        },
      },
    );
    expect(layeredArchitectureStrategy.match(ctx)).toBe(true);
  });

  it("matches with Japanese architecture signals", () => {
    const ctx = makeContext(
      [
        makeBulletList("b1", ["フロントエンド", "バックエンド", "データベース"]),
      ],
      {
        slideSpec: {
          title: "アーキテクチャ概要",
          intent: { type: "architecture", keyMessage: "アーキテクチャ", audienceTakeaway: "x" },
        },
      },
    );
    expect(layeredArchitectureStrategy.match(ctx)).toBe(true);
  });

  it("rejects without architecture signals", () => {
    const ctx = makeContext(
      [makeDiagram("d1")],
      {
        slideSpec: {
          title: "Flow Diagram",
          intent: { type: "process", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(layeredArchitectureStrategy.match(ctx)).toBe(false);
  });

  it("rejects without diagram or sufficient bullet items", () => {
    const ctx = makeContext(
      [makeParagraph("p1", "Architecture overview")],
      {
        slideSpec: {
          title: "Architecture",
          intent: { type: "architecture", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    expect(layeredArchitectureStrategy.match(ctx)).toBe(false);
  });

  it("rejects when more than 10 blocks", () => {
    const blocks = Array.from({ length: 11 }, (_, i) =>
      makeParagraph(`p${i}`, "Layer"),
    );
    const ctx = makeContext(blocks, {
      slideSpec: {
        title: "Architecture",
        intent: { type: "architecture", keyMessage: "x", audienceTakeaway: "x" },
      },
    });
    expect(layeredArchitectureStrategy.match(ctx)).toBe(false);
  });

  it("layout with diagram + callout creates main/sidebar split", () => {
    const ctx = makeContext(
      [
        makeDiagram("d1"),
        makeCallout("c1", "Design principle: separation of concerns"),
      ],
      {
        slideSpec: {
          title: "System Architecture",
          intent: { type: "architecture", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = layeredArchitectureStrategy.layout(ctx);
    expect(assignments.length).toBe(2);

    // Diagram should be in main (wider) region
    const diagramFrame = assignments.find((a) => a.blockId === "d1")!.frame;
    const calloutFrame = assignments.find((a) => a.blockId === "c1")!.frame;
    expect(diagramFrame.width).toBeGreaterThan(calloutFrame.width);

    // Callout has role hint
    expect(assignments.find((a) => a.blockId === "c1")!.hints?.role).toBe("callout");

    for (const a of assignments) {
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }
  });

  it("layout without diagram creates layer bands", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Presentation Layer"),
        makeParagraph("p2", "Business Logic Layer"),
        makeParagraph("p3", "Data Access Layer"),
      ],
      {
        slideSpec: {
          title: "Architecture Layers",
          intent: { type: "architecture", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const assignments = layeredArchitectureStrategy.layout(ctx);
    expect(assignments.length).toBe(3);

    // All should have card decoration
    for (const a of assignments) {
      expect(a.hints?.decoration).toBe("card");
      expect(a.hints?.alignment).toBe("center");
      expect(a.frame.width).toBeGreaterThan(0);
      expect(a.frame.height).toBeGreaterThanOrEqual(MIN_SUBFRAME_HEIGHT);
    }

    // Stacked vertically (each y > previous)
    for (let i = 1; i < assignments.length; i++) {
      expect(assignments[i]!.frame.y).toBeGreaterThan(assignments[i - 1]!.frame.y);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6A-3: precedence tests
// ---------------------------------------------------------------------------

describe("6A-3 strategy precedence", () => {
  const strategies = [
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority === 80),
    decisionRequestStrategy,
    recommendationComparisonStrategy,
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    dataInsightStoryStrategy,
    optionComparisonTableStrategy,
    processFlowWithImpactStrategy,
    implementationRoadmapStrategy,
    layeredArchitectureStrategy,
    oneMessageSummaryStrategy,
    threePointSummaryStrategy,
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority <= 70),
  ];

  it("implementation-roadmap overrides generic timeline with roadmap signals", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Phase 1: Discovery"),
        makeParagraph("p2", "Phase 2: Development"),
        makeParagraph("p3", "Phase 3: Launch"),
        makeCallout("c1", "Milestone: Q3 Go-Live"),
      ],
      {
        layoutSpec: { type: "timeline", density: "medium" },
        slideSpec: {
          title: "Implementation Roadmap",
          intent: { type: "timeline", keyMessage: "Roadmap", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("implementation-roadmap");
  });

  it("generic timeline selected without roadmap signals", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "Event A"),
        makeParagraph("p2", "Event B"),
      ],
      { layoutSpec: { type: "timeline", density: "medium" } },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("timeline");
  });

  it("one-message-summary does NOT match slides with charts", () => {
    const ctx = makeContext(
      [
        makeCallout("c1", "Summary point"),
        makeChart("ch1"),
      ],
      {
        slideSpec: {
          title: "Summary",
          intent: { type: "summary", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).not.toBe("one-message-summary");
  });

  it("three-point-summary does NOT match slides with tables", () => {
    const ctx = makeContext(
      [
        makeParagraph("p1", "A"),
        makeParagraph("p2", "B"),
        makeTable("t1"),
      ],
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).not.toBe("three-point-summary");
  });

  it("layered-architecture selected for architecture intent + diagram", () => {
    const ctx = makeContext(
      [
        makeDiagram("d1"),
        makeCallout("c1", "Loose coupling principle"),
      ],
      {
        slideSpec: {
          title: "System Architecture",
          intent: { type: "architecture", keyMessage: "x", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("layered-architecture");
  });
});

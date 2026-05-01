import { describe, expect, it } from "vitest";

import {
  countByType,
  countBulletItems,
  hasActionPlanSignals,
  hasCallout,
  hasChart,
  hasComplexVisuals,
  hasDiagram,
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
import { executiveSummaryKpiStrategy } from "#src/builders/layouts/executive-summary-kpi.js";
import { kpiDashboardWithInsightStrategy } from "#src/builders/layouts/kpi-dashboard-with-insight.js";
import { processFlowWithImpactStrategy } from "#src/builders/layouts/process-flow-with-impact.js";
import { smallMultiplesTrendStrategy } from "#src/builders/layouts/small-multiples-trend.js";
import type { LayoutContext } from "#src/builders/layouts/index.js";
import { MIN_SUBFRAME_HEIGHT } from "#src/builders/layouts/grid-utils.js";
import type { ContentBlock, SlideSpec, ThemeSpec } from "#src/index.js";

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
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    processFlowWithImpactStrategy,
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
      [makeTable("t1"), makeCallout("c1", "Approval requested")],
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
      executiveSummaryKpiStrategy,
      kpiDashboardWithInsightStrategy,
      smallMultiplesTrendStrategy,
      processFlowWithImpactStrategy,
    ];
    const genericStrategies = [comparisonStrategy, dashboardStrategy, timelineStrategy];

    for (const biz of businessStrategies) {
      for (const gen of genericStrategies) {
        expect(biz.priority).toBeGreaterThan(gen.priority);
      }
    }
  });

  it("title and section remain above business strategies", () => {
    const businessStrategies = [
      actionPlanTableStrategy,
      executiveSummaryKpiStrategy,
      kpiDashboardWithInsightStrategy,
      smallMultiplesTrendStrategy,
      processFlowWithImpactStrategy,
    ];
    // title-slide and section-divider are priority 80
    for (const biz of businessStrategies) {
      expect(biz.priority).toBeLessThan(80);
    }
  });

  it("business strategies have priority 75", () => {
    const bizStrategies = [
      actionPlanTableStrategy,
      executiveSummaryKpiStrategy,
      kpiDashboardWithInsightStrategy,
      smallMultiplesTrendStrategy,
      processFlowWithImpactStrategy,
    ];
    for (const s of bizStrategies) {
      expect(s.priority).toBe(75);
    }
  });
});

// ---------------------------------------------------------------------------
// Manufacturing report fixture tests
// ---------------------------------------------------------------------------

describe("manufacturing report expected strategy selection", () => {
  const strategies = [
    ...BUILTIN_LAYOUT_STRATEGIES.filter((s) => s.priority === 80),
    actionPlanTableStrategy,
    executiveSummaryKpiStrategy,
    kpiDashboardWithInsightStrategy,
    smallMultiplesTrendStrategy,
    processFlowWithImpactStrategy,
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
        makeCallout("c1", "Approval required by end of Q2"),
      ],
      {
        layoutSpec: { type: "single_column", density: "medium" },
        slideSpec: {
          title: "Action Plan: Production Improvement Items",
          intent: { type: "decision", keyMessage: "Action items", audienceTakeaway: "x" },
        },
      },
    );
    const strategy = selectLayoutStrategy(ctx, strategies);
    expect(strategy.id).toBe("action-plan-table");
  });
});

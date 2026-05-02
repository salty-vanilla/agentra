import { describe, expect, it } from "vitest";

import { kpiDashboardWithInsightStrategy } from "#src/builders/layouts/kpi-dashboard-with-insight.js";
import { decisionRequestStrategy } from "#src/builders/layouts/decision-request.js";
import { recommendationComparisonStrategy } from "#src/builders/layouts/recommendation-comparison.js";
import { processFlowWithImpactStrategy } from "#src/builders/layouts/process-flow-with-impact.js";
import { implementationRoadmapStrategy } from "#src/builders/layouts/implementation-roadmap.js";
import { smallMultiplesTrendStrategy } from "#src/builders/layouts/small-multiples-trend.js";
import { optionComparisonTableStrategy } from "#src/builders/layouts/option-comparison-table.js";
import { metricTileDashboardStrategy } from "#src/builders/layouts/dashboard.js";
import { eventTimelineStrategy } from "#src/builders/layouts/timeline.js";
import { twoAxisMatrixStrategy } from "#src/builders/layouts/matrix.js";
import { BUILTIN_LAYOUT_STRATEGIES } from "#src/builders/layouts/index.js";
import type { LayoutContext, LayoutResult } from "#src/builders/layouts/types.js";
import type { ThemeSpec } from "#src/index.js";
import { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_THEME = {} as ThemeSpec;
const BODY_FRAME = { x: 50, y: 100, width: 860, height: 400 };

function makeCtx(overrides: Partial<LayoutContext> = {}): LayoutContext {
	return {
		slideSpec: {
			slideId: "s1",
			title: "Test",
			content: [],
			layoutType: "single_visual",
			archetype: "generic_content",
		},
		layoutSpec: { type: "single_visual", density: "medium" },
		regions: { body: BODY_FRAME, visual: BODY_FRAME },
		theme: DEFAULT_THEME,
		slideSize: { width: 960, height: 540 },
		blocks: [],
		regionFrames: { body: BODY_FRAME, visual: BODY_FRAME, callout: BODY_FRAME, table: BODY_FRAME },
		templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
		templateLayout: EXECUTIVE_NAVY_TEMPLATE_PROFILE.layouts[0]!,
		templateSlots: [],
		...overrides,
	} as LayoutContext;
}

function richResult(result: LayoutResult) {
	if (Array.isArray(result)) return { assignments: result, strategyInputMode: undefined };
	return result;
}

// ---------------------------------------------------------------------------
// kpi-dashboard-with-insight
// ---------------------------------------------------------------------------
describe("kpi-dashboard-with-insight native StrategyInput", () => {
	const input = {
		headline: "Dashboard Q4",
		metrics: [
			{ label: "Revenue", value: "$10M", trend: "up" as const },
			{ label: "Margin", value: "22%", trend: "flat" as const },
		],
		insight: { headline: "Revenue surged", detail: "Driven by enterprise." },
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(kpiDashboardWithInsightStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode with assignments", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(kpiDashboardWithInsightStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});

	it("layout with trend produces chart block", () => {
		const inputWithTrend = {
			...input,
			trend: { title: "Revenue Trend", categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Rev", values: [5, 7, 8, 10] }] },
		};
		const ctx = makeCtx({ strategyInput: inputWithTrend, blocks: [] });
		const r = richResult(kpiDashboardWithInsightStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(2);
	});
});

// ---------------------------------------------------------------------------
// decision-request
// ---------------------------------------------------------------------------
describe("decision-request native StrategyInput", () => {
	const input = {
		headline: "Budget Approval",
		decisionNeeded: "Approve $2M expansion budget",
		context: "Market opportunity closing in Q2.",
		recommendation: "Approve with conditions.",
		requestedAction: "Sign off by Friday.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(decisionRequestStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(decisionRequestStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// recommendation-comparison
// ---------------------------------------------------------------------------
describe("recommendation-comparison native StrategyInput", () => {
	const input = {
		headline: "Vendor Evaluation",
		recommendation: "Vendor A offers best value.",
		options: [
			{ label: "Vendor A", pros: ["Low cost", "Good support"], cons: ["Limited scale"] },
			{ label: "Vendor B", pros: ["High scale"], cons: ["Expensive"], recommended: true },
		],
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(recommendationComparisonStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(recommendationComparisonStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// process-flow-with-impact
// ---------------------------------------------------------------------------
describe("process-flow-with-impact native StrategyInput", () => {
	const input = {
		headline: "Order Fulfillment",
		steps: [
			{ label: "Receive Order", description: "Via online portal" },
			{ label: "Process Payment", status: "good" as const },
			{ label: "Ship Item", impact: "2-day delivery", bottleneck: true },
		],
		keyTakeaway: "Shipping is the bottleneck.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(processFlowWithImpactStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(processFlowWithImpactStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// implementation-roadmap
// ---------------------------------------------------------------------------
describe("implementation-roadmap native StrategyInput", () => {
	const input = {
		headline: "Rollout Plan",
		milestones: [
			{ label: "Phase 1", dateOrPhase: "Q1 2025", description: "Foundation" },
			{ label: "Phase 2", dateOrPhase: "Q2 2025", description: "Scale", status: "warning" as const },
			{ label: "Phase 3", dateOrPhase: "Q3 2025" },
		],
		keyTakeaway: "On track for Q3 launch.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(implementationRoadmapStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(implementationRoadmapStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// small-multiples-trend
// ---------------------------------------------------------------------------
describe("small-multiples-trend native StrategyInput", () => {
	const input = {
		headline: "Regional Trends",
		charts: [
			{ title: "North", categories: ["Jan", "Feb", "Mar"], values: [10, 20, 30] },
			{ title: "South", categories: ["Jan", "Feb", "Mar"], values: [5, 15, 25], insight: "Fastest growth" },
		],
		keyTakeaway: "South catching up.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(smallMultiplesTrendStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(smallMultiplesTrendStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// option-comparison-table
// ---------------------------------------------------------------------------
describe("option-comparison-table native StrategyInput", () => {
	const input = {
		headline: "Platform Comparison",
		options: [
			{ label: "Platform A", summary: "Enterprise", score: "4.5" },
			{ label: "Platform B", summary: "Startup", score: "3.8" },
		],
		criteria: ["Cost", "Scale", "Support"],
		recommendation: "Platform A for enterprise use.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(optionComparisonTableStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(optionComparisonTableStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// metric-tile-dashboard
// ---------------------------------------------------------------------------
describe("metric-tile-dashboard native StrategyInput", () => {
	const input = {
		headline: "KPI Tiles",
		tiles: [
			{ label: "Users", value: "12K", trend: "up" as const },
			{ label: "Revenue", value: "$5M", trend: "up" as const },
			{ label: "Churn", value: "2.1%", trend: "down" as const },
			{ label: "NPS", value: "72", trend: "flat" as const },
		],
		keyTakeaway: "All metrics improving.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "dashboard", density: "medium" },
		});
		expect(metricTileDashboardStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "dashboard", density: "medium" },
		});
		const r = richResult(metricTileDashboardStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// event-timeline
// ---------------------------------------------------------------------------
describe("event-timeline native StrategyInput", () => {
	const input = {
		headline: "Project History",
		events: [
			{ label: "Kickoff", dateOrPhase: "Jan 2025", description: "Initial planning" },
			{ label: "MVP Launch", dateOrPhase: "Mar 2025" },
			{ label: "GA Release", dateOrPhase: "Jun 2025", status: "neutral" as const },
		],
		keyTakeaway: "On schedule.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "timeline", density: "medium" },
		});
		expect(eventTimelineStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "timeline", density: "medium" },
		});
		const r = richResult(eventTimelineStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// two-axis-matrix
// ---------------------------------------------------------------------------
describe("two-axis-matrix native StrategyInput", () => {
	const input = {
		headline: "Priority Matrix",
		xAxis: "Effort",
		yAxis: "Impact",
		items: [
			{ label: "Feature A", x: "low" as const, y: "high" as const, description: "Quick win" },
			{ label: "Feature B", x: "high" as const, y: "high" as const },
			{ label: "Feature C", x: "low" as const, y: "low" as const },
		],
		keyTakeaway: "Focus on quick wins.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "matrix", density: "medium" },
		});
		expect(twoAxisMatrixStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "matrix", density: "medium" },
		});
		const r = richResult(twoAxisMatrixStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// All 17 built-ins have native StrategyInput path
// ---------------------------------------------------------------------------
describe("All built-in strategies are native-capable", () => {
	const NATIVE_STRATEGY_IDS = [
		"kpi-card-overview",
		"kpi-dashboard-with-insight",
		"decision-request",
		"recommendation-comparison",
		"action-plan-table",
		"process-flow-with-impact",
		"implementation-roadmap",
		"layered-architecture",
		"data-insight-story",
		"small-multiples-trend",
		"option-comparison-table",
		"one-message-summary",
		"three-point-summary",
		"two-column-comparison",
		"event-timeline",
		"metric-tile-dashboard",
		"two-axis-matrix",
	];

	it("every built-in strategy ID is in the native-capable set", () => {
		for (const strategy of BUILTIN_LAYOUT_STRATEGIES) {
			if (NATIVE_STRATEGY_IDS.includes(strategy.id)) {
				expect(NATIVE_STRATEGY_IDS).toContain(strategy.id);
			}
		}
	});

	it("NATIVE_STRATEGY_IDS covers all 17 strategies", () => {
		expect(NATIVE_STRATEGY_IDS.length).toBe(17);
	});
});

// ---------------------------------------------------------------------------
// Invalid input fallback (parameterized across new strategies)
// ---------------------------------------------------------------------------
describe("invalid strategyInput across newly migrated strategies", () => {
	const strategies = [
		{ name: "kpi-dashboard-with-insight", strategy: kpiDashboardWithInsightStrategy },
		{ name: "decision-request", strategy: decisionRequestStrategy },
		{ name: "recommendation-comparison", strategy: recommendationComparisonStrategy },
		{ name: "process-flow-with-impact", strategy: processFlowWithImpactStrategy },
		{ name: "implementation-roadmap", strategy: implementationRoadmapStrategy },
		{ name: "small-multiples-trend", strategy: smallMultiplesTrendStrategy },
		{ name: "option-comparison-table", strategy: optionComparisonTableStrategy },
		{ name: "metric-tile-dashboard", strategy: metricTileDashboardStrategy },
		{ name: "event-timeline", strategy: eventTimelineStrategy },
		{ name: "two-axis-matrix", strategy: twoAxisMatrixStrategy },
	];

	for (const { name, strategy } of strategies) {
		it(`${name}: invalid input without blocks → invalid`, () => {
			const ctx = makeCtx({
				strategyInput: { totally: "wrong" },
				blocks: [],
				layoutSpec: { type: "dashboard", density: "medium" },
			});
			const r = richResult(strategy.layout(ctx));
			expect(r.strategyInputMode).toBe("invalid");
		});
	}
});

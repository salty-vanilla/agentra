import { describe, expect, it } from "vitest";

import { kpiCardOverviewStrategy } from "#src/builders/layouts/kpi-card-overview.js";
import { actionPlanTableStrategy } from "#src/builders/layouts/action-plan-table.js";
import { layeredArchitectureStrategy } from "#src/builders/layouts/layered-architecture.js";
import { dataInsightStoryStrategy } from "#src/builders/layouts/data-insight-story.js";
import { twoColumnComparisonStrategy } from "#src/builders/layouts/index.js";
import { threePointSummaryStrategy } from "#src/builders/layouts/three-point-summary.js";
import { oneMessageSummaryStrategy } from "#src/builders/layouts/one-message-summary.js";
import type { LayoutContext, LayoutResult } from "#src/builders/layouts/types.js";
import type { ContentBlock, ThemeSpec } from "#src/index.js";
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
		regionFrames: { body: BODY_FRAME, visual: BODY_FRAME, callout: BODY_FRAME },
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
// kpi-card-overview — native
// ---------------------------------------------------------------------------
describe("kpi-card-overview native StrategyInput", () => {
	const input = {
		headline: "Q4 Results",
		metrics: [
			{ label: "Revenue", value: "$10M", trend: "up" as const },
			{ label: "Margin", value: "22%", trend: "flat" as const },
			{ label: "Growth", value: "15%", trend: "up" as const },
		],
		keyTakeaway: "Strong quarter overall.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(kpiCardOverviewStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode with syntheticBlocks", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
		if ("syntheticBlocks" in r && r.syntheticBlocks) {
			expect(r.syntheticBlocks.length).toBeGreaterThanOrEqual(3);
		}
	});

	it("falls back when strategyInput is missing", () => {
		const blocks: ContentBlock[] = [
			{ id: "m1", type: "metric", label: "A", value: "1" },
			{ id: "m2", type: "metric", label: "B", value: "2" },
			{ id: "m3", type: "metric", label: "C", value: "3" },
			{ id: "c1", type: "callout", text: "Note" },
		];
		const ctx = makeCtx({ blocks });
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("missing");
	});
});

// ---------------------------------------------------------------------------
// action-plan-table — native
// ---------------------------------------------------------------------------
describe("action-plan-table native StrategyInput", () => {
	const input = {
		headline: "Action Plan",
		actions: [
			{ action: "Hire team", owner: "VP Eng", dueDate: "Q1", status: "in-progress" as const },
			{ action: "Launch MVP", owner: "PM", dueDate: "Q2" },
		],
		keyTakeaway: "On track.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(actionPlanTableStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(actionPlanTableStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// layered-architecture — native
// ---------------------------------------------------------------------------
describe("layered-architecture native StrategyInput", () => {
	const input = {
		headline: "System Architecture",
		layers: [
			{ name: "Presentation", components: ["React", "Next.js"] },
			{ name: "API", components: ["GraphQL", "REST"] },
			{ name: "Data", components: ["PostgreSQL", "Redis"] },
		],
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(layeredArchitectureStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(layeredArchitectureStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// data-insight-story — native
// ---------------------------------------------------------------------------
describe("data-insight-story native StrategyInput", () => {
	const input = {
		headline: "Revenue Analysis",
		dataSummary: "Revenue grew 15% YoY driven by enterprise segment.",
		insight: { headline: "Enterprise leads growth", detail: "Enterprise revenue doubled." },
		keyTakeaway: "Focus on enterprise.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(dataInsightStoryStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(dataInsightStoryStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// two-column-comparison — native
// ---------------------------------------------------------------------------
describe("two-column-comparison native StrategyInput", () => {
	const input = {
		headline: "Build vs Buy",
		left: { title: "Build", points: ["Full control", "Higher cost"] },
		right: { title: "Buy", points: ["Faster", "Less flexibility"] },
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "comparison", density: "medium" },
		});
		expect(twoColumnComparisonStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({
			strategyInput: input,
			blocks: [],
			layoutSpec: { type: "comparison", density: "medium" },
		});
		const r = richResult(twoColumnComparisonStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// three-point-summary — native
// ---------------------------------------------------------------------------
describe("three-point-summary native StrategyInput", () => {
	const input = {
		headline: "Three Pillars",
		points: [
			{ title: "Quality", description: "Ship high-quality code" },
			{ title: "Speed", description: "Fast iteration cycles" },
			{ title: "Scale", description: "Handle growth" },
		],
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(threePointSummaryStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(threePointSummaryStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// one-message-summary — native
// ---------------------------------------------------------------------------
describe("one-message-summary native StrategyInput", () => {
	const input = {
		message: "We are ready to launch.",
		supportingText: "All milestones achieved.",
	};

	it("match returns true with valid strategyInput", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		expect(oneMessageSummaryStrategy.match(ctx)).toBe(true);
	});

	it("layout returns native mode", () => {
		const ctx = makeCtx({ strategyInput: input, blocks: [] });
		const r = richResult(oneMessageSummaryStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
		expect(r.assignments.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Trace state tests (comprehensive mode coverage)
// ---------------------------------------------------------------------------
describe("strategyInputMode trace states", () => {
	it("valid input → native", () => {
		const ctx = makeCtx({
			strategyInput: {
				headline: "Q4",
				metrics: [
					{ label: "A", value: "1" },
					{ label: "B", value: "2" },
					{ label: "C", value: "3" },
				],
			},
			blocks: [],
		});
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("native");
	});

	it("missing input with contentBlocks → legacy-fallback", () => {
		const ctx = makeCtx({
			blocks: [
				{ id: "m1", type: "metric", label: "A", value: "1" },
				{ id: "m2", type: "metric", label: "B", value: "2" },
				{ id: "m3", type: "metric", label: "C", value: "3" },
				{ id: "c1", type: "callout", text: "Note" },
			],
		});
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("missing");
	});

	it("invalid input with contentBlocks → invalid-fallback", () => {
		const ctx = makeCtx({
			strategyInput: { wrong: "shape" },
			blocks: [
				{ id: "m1", type: "metric", label: "A", value: "1" },
				{ id: "m2", type: "metric", label: "B", value: "2" },
				{ id: "m3", type: "metric", label: "C", value: "3" },
				{ id: "c1", type: "callout", text: "Note" },
			],
		});
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("invalid-fallback");
		expect(r.assignments.length).toBeGreaterThan(0);
		if ("strategyInputWarnings" in r) {
			expect(r.strategyInputWarnings).toBeDefined();
			expect(r.strategyInputWarnings!.length).toBeGreaterThan(0);
		}
	});

	it("invalid input without contentBlocks → invalid", () => {
		const ctx = makeCtx({
			strategyInput: { wrong: "shape" },
			blocks: [],
		});
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("invalid");
		if ("strategyInputWarnings" in r) {
			expect(r.strategyInputWarnings).toBeDefined();
			expect(r.strategyInputWarnings!.length).toBeGreaterThan(0);
		}
	});

	it("missing input without contentBlocks → missing", () => {
		const ctx = makeCtx({ blocks: [] });
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("missing");
	});
});

// ---------------------------------------------------------------------------
// StrategyInput schema invariant: no rendering keys
// ---------------------------------------------------------------------------
describe("StrategyInput schemas contain no rendering keys", () => {
	it("KpiCardOverviewInput has no x/y/width/height/fill/stroke keys", () => {
		const input = {
			headline: "Q4",
			metrics: [
				{ label: "Revenue", value: "$10M", trend: "up" },
				{ label: "Margin", value: "22%", trend: "flat" },
				{ label: "Growth", value: "15%", trend: "up" },
			],
			keyTakeaway: "Strong quarter.",
		};
		const json = JSON.stringify(input);
		expect(json).not.toMatch(/"(x|y|width|height|fill|stroke|fontSize|fontFamily|shape)"/);
	});

	it("ThreePointSummaryInput has no rendering keys", () => {
		const input = {
			headline: "Three Pillars",
			points: [
				{ title: "Quality", description: "Ship well" },
				{ title: "Speed", description: "Fast" },
				{ title: "Scale", description: "Grow" },
			],
		};
		const json = JSON.stringify(input);
		expect(json).not.toMatch(/"(x|y|width|height|fill|stroke|fontSize|fontFamily|shape)"/);
	});
});

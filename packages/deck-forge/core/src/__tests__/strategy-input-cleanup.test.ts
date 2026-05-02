/**
 * Phase 8F-cleanup tests.
 *
 * - Native StrategyInput wins over contentBlocks
 * - Fallback-only contentBlocks path
 * - Missing / invalid trace modes
 * - No strategy-specific placeholder generation in layout strategies
 * - No old Strategy IDs in active production code
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { kpiCardOverviewStrategy } from "#src/builders/layouts/kpi-card-overview.js";
import { actionPlanTableStrategy } from "#src/builders/layouts/action-plan-table.js";
import { twoColumnComparisonStrategy } from "#src/builders/layouts/comparison.js";
import { metricTileDashboardStrategy } from "#src/builders/layouts/dashboard.js";
import { twoAxisMatrixStrategy } from "#src/builders/layouts/matrix.js";
import { BUILTIN_LAYOUT_STRATEGIES } from "#src/builders/layouts/index.js";
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
			layoutType: "single_column",
			archetype: "generic_content",
		},
		layoutSpec: { type: "single_column", density: "medium" },
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
	if (Array.isArray(result)) return { assignments: result, strategyInputMode: undefined, syntheticBlocks: undefined, strategyInputWarnings: undefined };
	return result;
}

// ---------------------------------------------------------------------------
// Valid StrategyInput + conflicting contentBlocks data per strategy
// ---------------------------------------------------------------------------

const NATIVE_WINS_CASES = [
	{
		name: "kpi-card-overview",
		strategy: kpiCardOverviewStrategy,
		validInput: {
			headline: "Q4 Results",
			metrics: [
				{ label: "Revenue", value: "$10M", trend: "up" as const },
				{ label: "Margin", value: "22%", trend: "flat" as const },
				{ label: "Growth", value: "15%", trend: "up" as const },
			],
			keyTakeaway: "Strong quarter overall.",
		},
		conflictingBlocks: [
			{ id: "m1", type: "metric", label: "WRONG-A", value: "0" },
			{ id: "m2", type: "metric", label: "WRONG-B", value: "0" },
			{ id: "m3", type: "metric", label: "WRONG-C", value: "0" },
			{ id: "c1", type: "callout", text: "WRONG callout" },
		] as ContentBlock[],
	},
	{
		name: "action-plan-table",
		strategy: actionPlanTableStrategy,
		validInput: {
			headline: "Action Plan",
			actions: [
				{ action: "Hire team", owner: "VP Eng", dueDate: "Q1", status: "in-progress" as const },
				{ action: "Launch MVP", owner: "PM", dueDate: "Q2" },
			],
			keyTakeaway: "On track.",
		},
		conflictingBlocks: [
			{ id: "t1", type: "table", headers: ["WRONG"], rows: [["wrong"]] },
			{ id: "c1", type: "callout", text: "WRONG callout" },
		] as ContentBlock[],
	},
	{
		name: "two-column-comparison",
		strategy: twoColumnComparisonStrategy,
		validInput: {
			headline: "Build vs Buy",
			left: { title: "Build", points: ["Full control", "Higher cost"] },
			right: { title: "Buy", points: ["Faster", "Less flexibility"] },
		},
		conflictingBlocks: [
			{ id: "p1", type: "paragraph", text: "WRONG left" },
			{ id: "p2", type: "paragraph", text: "WRONG right" },
		] as ContentBlock[],
	},
	{
		name: "metric-tile-dashboard",
		strategy: metricTileDashboardStrategy,
		validInput: {
			headline: "KPI Tiles",
			tiles: [
				{ label: "Users", value: "12K", trend: "up" as const },
				{ label: "Revenue", value: "$5M", trend: "up" as const },
				{ label: "Churn", value: "2.1%", trend: "down" as const },
				{ label: "NPS", value: "72", trend: "flat" as const },
			],
			keyTakeaway: "All metrics improving.",
		},
		conflictingBlocks: [
			{ id: "m1", type: "metric", label: "WRONG", value: "0" },
			{ id: "m2", type: "metric", label: "WRONG", value: "0" },
		] as ContentBlock[],
	},
	{
		name: "two-axis-matrix",
		strategy: twoAxisMatrixStrategy,
		validInput: {
			headline: "Priority Matrix",
			xAxis: "Effort",
			yAxis: "Impact",
			items: [
				{ label: "Feature A", x: "low" as const, y: "high" as const, description: "Quick win" },
				{ label: "Feature B", x: "high" as const, y: "high" as const },
				{ label: "Feature C", x: "low" as const, y: "low" as const },
			],
			keyTakeaway: "Focus on quick wins.",
		},
		conflictingBlocks: [
			{ id: "p1", type: "paragraph", text: "WRONG item 1" },
			{ id: "p2", type: "paragraph", text: "WRONG item 2" },
		] as ContentBlock[],
	},
];

// ---------------------------------------------------------------------------
// 9.1 — Native wins over contentBlocks
// ---------------------------------------------------------------------------

describe("native StrategyInput wins over conflicting contentBlocks", () => {
	for (const { name, strategy, validInput, conflictingBlocks } of NATIVE_WINS_CASES) {
		it(`${name}: strategyInput wins, contentBlocks ignored`, () => {
			const ctx = makeCtx({
				strategyInput: validInput,
				blocks: conflictingBlocks,
				layoutSpec: { type: name === "metric-tile-dashboard" ? "dashboard" : name === "two-axis-matrix" ? "matrix" : "single_column", density: "medium" },
			});
			const r = richResult(strategy.layout(ctx));

			// Must be native mode
			expect(r.strategyInputMode).toBe("native");

			// syntheticBlocks must NOT contain "WRONG"
			if (r.syntheticBlocks) {
				const serialized = JSON.stringify(r.syntheticBlocks);
				expect(serialized).not.toContain("WRONG");
			}

			// Assignments must reference synthetic block IDs, not conflicting block IDs
			const assignedIds = r.assignments.map((a) => a.blockId);
			for (const block of conflictingBlocks) {
				expect(assignedIds).not.toContain(block.id);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 9.2 — Fallback-only contentBlocks
// ---------------------------------------------------------------------------

describe("legacy-fallback when strategyInput is missing", () => {
	it("kpi-card-overview: missing strategyInput + contentBlocks → assignments from contentBlocks", () => {
		const blocks: ContentBlock[] = [
			{ id: "m1", type: "metric", label: "A", value: "1" },
			{ id: "m2", type: "metric", label: "B", value: "2" },
			{ id: "m3", type: "metric", label: "C", value: "3" },
			{ id: "c1", type: "callout", text: "Note" },
		];
		const ctx = makeCtx({ blocks });
		const r = richResult(kpiCardOverviewStrategy.layout(ctx));
		expect(r.strategyInputMode).toBe("missing");
		expect(r.assignments.length).toBeGreaterThan(0);
		// Assignments reference the original block IDs
		const assignedIds = r.assignments.map((a) => a.blockId);
		expect(assignedIds).toContain("m1");
	});
});

// ---------------------------------------------------------------------------
// 9.3 — Missing no fallback
// ---------------------------------------------------------------------------

describe("missing strategyInput + no contentBlocks", () => {
	for (const { name, strategy } of NATIVE_WINS_CASES) {
		it(`${name}: no crash, mode is missing, has warning`, () => {
			const ctx = makeCtx({
				blocks: [],
				layoutSpec: { type: name === "metric-tile-dashboard" ? "dashboard" : name === "two-axis-matrix" ? "matrix" : "single_column", density: "medium" },
			});
			const r = richResult(strategy.layout(ctx));
			expect(r.strategyInputMode).toBe("missing");
			expect(r.strategyInputWarnings).toBeDefined();
			expect(r.strategyInputWarnings!.length).toBeGreaterThan(0);
		});
	}
});

// ---------------------------------------------------------------------------
// 9.4 — Invalid with fallback
// ---------------------------------------------------------------------------

describe("invalid strategyInput + contentBlocks → invalid-fallback", () => {
	for (const { name, strategy, conflictingBlocks } of NATIVE_WINS_CASES) {
		it(`${name}: invalid-fallback mode with warning`, () => {
			const ctx = makeCtx({
				strategyInput: { totally: "wrong" },
				blocks: conflictingBlocks,
				layoutSpec: { type: name === "metric-tile-dashboard" ? "dashboard" : name === "two-axis-matrix" ? "matrix" : "single_column", density: "medium" },
			});
			const r = richResult(strategy.layout(ctx));
			expect(r.strategyInputMode).toBe("invalid-fallback");
			expect(r.strategyInputWarnings).toBeDefined();
			expect(r.strategyInputWarnings!.length).toBeGreaterThan(0);
		});
	}
});

// ---------------------------------------------------------------------------
// 9.5 — Invalid without fallback
// ---------------------------------------------------------------------------

describe("invalid strategyInput + no contentBlocks → invalid", () => {
	for (const { name, strategy } of NATIVE_WINS_CASES) {
		it(`${name}: invalid mode with warning`, () => {
			const ctx = makeCtx({
				strategyInput: { totally: "wrong" },
				blocks: [],
				layoutSpec: { type: name === "metric-tile-dashboard" ? "dashboard" : name === "two-axis-matrix" ? "matrix" : "single_column", density: "medium" },
			});
			const r = richResult(strategy.layout(ctx));
			expect(r.strategyInputMode).toBe("invalid");
			expect(r.strategyInputWarnings).toBeDefined();
			expect(r.strategyInputWarnings!.length).toBeGreaterThan(0);
		});
	}
});

// ---------------------------------------------------------------------------
// 9.6 — No strategy-specific placeholder generation in layout strategies
// ---------------------------------------------------------------------------

describe("layout strategies do not contain placeholder generation", () => {
	const LAYOUT_DIR = resolve(__dirname, "../builders/layouts");
	const PLACEHOLDER_PATTERNS = [
		/"Option A"/,
		/"Option B"/,
		/"Step 1"/,
		/"Step 2"/,
		/"Layer 1"/,
		/"Trend A"/,
		/"Series A"/,
		/"Metric 1"/,
		/"Tile 1"/,
		/"Event 1"/,
		/"Item 1"/,
		/"Phase 1"/,
		/"Point 1"/,
	];

	const strategyFiles = readdirSync(LAYOUT_DIR)
		.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("index"));

	for (const file of strategyFiles) {
		it(`${file} does not contain hardcoded placeholder semantic labels`, () => {
			const content = readFileSync(join(LAYOUT_DIR, file), "utf-8");
			for (const pattern of PLACEHOLDER_PATTERNS) {
				expect(content).not.toMatch(pattern);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 9.7 — Old Strategy ID references
// ---------------------------------------------------------------------------

describe("no old Strategy IDs in active production code", () => {
	it("no built-in strategy uses 'executive-summary-kpi' as ID", () => {
		const ids = BUILTIN_LAYOUT_STRATEGIES.map((s) => s.id);
		expect(ids).not.toContain("executive-summary-kpi");
	});

	it("executive-summary-kpi.ts does not exist as layout strategy file", () => {
		const LAYOUT_DIR = resolve(__dirname, "../builders/layouts");
		const files = readdirSync(LAYOUT_DIR);
		expect(files).not.toContain("executive-summary-kpi.ts");
	});

	it("all 17 native-capable strategies use current IDs", () => {
		const CURRENT_IDS = [
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
		const builtinIds = BUILTIN_LAYOUT_STRATEGIES.map((s) => s.id);
		for (const id of CURRENT_IDS) {
			expect(builtinIds).toContain(id);
		}
	});
});

/**
 * Phase 8J: Strategy selection diversity and text-signal scoring tests.
 *
 * Uses the 8I dogfooding fixture (6-slide manufacturing Q2 report)
 * to validate that strategy selection produces diverse, semantically
 * appropriate strategies.
 */

import { describe, expect, it } from "vitest";
import { runStrategyPipeline } from "#src/pipeline/strategy-pipeline.js";
import type { DeckPlan } from "#src/strategy/deck-plan.js";

/**
 * 8I dogfooding fixture: 製造ライン #4 2026年Q2 パフォーマンス報告
 */
function makeManufacturingQ2DeckPlan(): DeckPlan {
	return {
		id: "dogfood-8i",
		title: "製造ライン #4 2026年Q2 パフォーマンス報告",
		objective: "Manufacturing Line #4 Q2 2026 performance report for executive decision-making",
		audience: "executive",
		genre: "business-review",
		density: "medium",
		slides: [
			{
				id: "slide-1",
				keyMessage: "Q2全体サマリー：生産量は前年比+8%、不良率は目標内",
				audienceTakeaway: "Q2は全体として良好なパフォーマンス",
				intent: "summarize",
				contentKinds: ["summary", "kpi"],
			},
			{
				id: "slide-2",
				keyMessage: "KPI達成状況：4つの主要指標すべてが目標を達成",
				audienceTakeaway: "主要KPIはすべて達成済み",
				intent: "report",
				contentKinds: ["kpi"],
			},
			{
				id: "slide-3",
				keyMessage: "月次トレンド：4月→6月の生産量推移と不良率の変化",
				audienceTakeaway: "トレンドは改善傾向だが6月に若干の悪化",
				intent: "report",
				contentKinds: ["chart", "kpi"],
			},
			{
				id: "slide-4",
				keyMessage: "不良率・停止時間の要因分析：設備老朽化と原材料品質が主因",
				audienceTakeaway: "不良率の主な原因は2つの構造的要因",
				intent: "diagnose",
				contentKinds: ["root-cause"],
			},
			{
				id: "slide-5",
				keyMessage: "Q3改善施策：設備更新と品質管理プロセスの強化",
				audienceTakeaway: "Q3に向けた具体的な改善アクション",
				intent: "plan",
				contentKinds: ["action-plan", "process"],
			},
			{
				id: "slide-6",
				keyMessage: "承認依頼：設備投資¥50Mの承認と改善計画の実行開始",
				audienceTakeaway: "¥50M投資の承認が必要",
				intent: "decide",
				contentKinds: ["decision", "action-plan"],
			},
		],
	};
}

describe("Strategy selection — 8I dogfooding fixture", () => {
	it("selects diverse strategies (max 3 of same type in 6 slides)", async () => {
		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		const strategies = result.slideResults.map((r) => r.selection.strategyId);
		expect(strategies).toHaveLength(6);

		// Count frequency of each strategy
		const freq = new Map<string, number>();
		for (const s of strategies) {
			freq.set(s, (freq.get(s) ?? 0) + 1);
		}

		// No strategy should appear more than 3 times
		for (const [strategyId, count] of freq) {
			expect(count, `${strategyId} appears ${count} times`).toBeLessThanOrEqual(3);
		}

		// At least 4 distinct strategies
		expect(freq.size, `Only ${freq.size} distinct strategies: ${strategies.join(", ")}`).toBeGreaterThanOrEqual(4);
	});

	it("trend slide should NOT select kpi-card-overview", async () => {
		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		// slide-3 is the trend slide
		const trendSlide = result.slideResults.find((r) => r.slideSpec.id === "slide-3");
		expect(trendSlide).toBeDefined();
		expect(trendSlide!.selection.strategyId).not.toBe("kpi-card-overview");
	});

	it("process/action slide should select process/action-oriented strategy", async () => {
		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		// slide-5 is the process/action slide
		const processSlide = result.slideResults.find((r) => r.slideSpec.id === "slide-5");
		expect(processSlide).toBeDefined();

		const processActionStrategies = [
			"process-flow-with-impact",
			"implementation-roadmap",
			"action-plan-table",
		];
		expect(processActionStrategies).toContain(processSlide!.selection.strategyId);
	});

	it("final approval slide should select decision/action strategy", async () => {
		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		// slide-6 is the final decision/approval slide
		const finalSlide = result.slideResults.find((r) => r.slideSpec.id === "slide-6");
		expect(finalSlide).toBeDefined();

		const decisionStrategies = [
			"decision-request",
			"action-plan-table",
			"recommendation-comparison",
		];
		expect(decisionStrategies).toContain(finalSlide!.selection.strategyId);
	});

	it("root cause slide should select analysis strategy", async () => {
		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		// slide-4 is the root-cause analysis slide
		const analysisSlide = result.slideResults.find((r) => r.slideSpec.id === "slide-4");
		expect(analysisSlide).toBeDefined();

		const analysisStrategies = [
			"data-insight-story",
			"two-column-comparison",
			"two-axis-matrix",
		];
		expect(analysisStrategies).toContain(analysisSlide!.selection.strategyId);
	});

	it("all selected strategies are valid registry IDs", async () => {
		const { createBuiltinStrategyRegistry } = await import("#src/strategy/index.js");
		const registry = createBuiltinStrategyRegistry();
		const allIds = registry.listStrategyManifests().map((m) => m.id);

		const result = await runStrategyPipeline({
			deckPlan: makeManufacturingQ2DeckPlan(),
		});

		for (const sr of result.slideResults) {
			expect(allIds, `strategy ${sr.selection.strategyId} not in registry`).toContain(
				sr.selection.strategyId,
			);
		}
	});
});

describe("Strategy selection — diversity penalty", () => {
	it("applies diversity penalty when strategy is overused", async () => {
		// Create a deck where all slides have similar KPI content
		const homogeneousDeck: DeckPlan = {
			id: "homogeneous",
			title: "All KPIs",
			audience: "executive",
			genre: "business-review",
			density: "medium",
			slides: Array.from({ length: 6 }, (_, i) => ({
				id: `slide-${i + 1}`,
				keyMessage: `KPI ${i + 1} status`,
				intent: "report" as const,
				contentKinds: ["kpi" as const],
			})),
		};

		const result = await runStrategyPipeline({
			deckPlan: homogeneousDeck,
		});

		const strategies = result.slideResults.map((r) => r.selection.strategyId);
		const freq = new Map<string, number>();
		for (const s of strategies) {
			freq.set(s, (freq.get(s) ?? 0) + 1);
		}

		// Even with homogeneous content, diversity penalty should prevent
		// all 6 from being the same strategy
		const maxCount = Math.max(...freq.values());
		expect(
			maxCount,
			`One strategy used ${maxCount}/6 times: ${strategies.join(", ")}`,
		).toBeLessThanOrEqual(4);
	});
});

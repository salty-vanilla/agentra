/**
 * Phase 8I E2E smoke test: ParsedDeckPlan → canonical DeckPlan → IR → PPTX.
 *
 * Verifies the full new-path pipeline works end-to-end without touching LLM.
 */
import { describe, expect, it } from "vitest";
import { convertParsedDeckPlanToCanonicalDeckPlan } from "#src/pipeline/convert-to-canonical-deck-plan.js";
import { buildPresentationIrFromDeckPlan, runStrategyPipeline } from "#src/pipeline/strategy-pipeline.js";
import { analyzeDeckStrategyQuality } from "#src/diagnostics/strategy-quality-diagnostics.js";
import type { ParsedDeckPlan, PresentationBrief } from "#src/schemas/intent-artifacts.js";

const BRIEF: PresentationBrief = {
	id: "brief-e2e",
	title: "Q3 Business Review",
	audience: { primary: "executive", expertiseLevel: "executive" },
	goal: { type: "report", mainMessage: "Q3 performance review", desiredOutcome: "Alignment on priorities" },
	tone: { formality: "business", energy: "confident", technicalDepth: "medium" },
	narrative: { structure: "analysis", arc: [{ role: "hook", message: "Q3 results" }] },
	output: { formats: ["pptx"], aspectRatio: "16:9", language: "en" },
	constraints: { slideCount: 4 },
	visualDirection: { style: "corporate", mood: "trustworthy" },
};

const PARSED_DECK_PLAN: ParsedDeckPlan = {
	id: "deck-e2e",
	briefId: "brief-e2e",
	title: "Q3 Business Review",
	slideCountTarget: 4,
	globalStoryline: "Context → Results → Challenges → Next Steps",
	sections: [
		{
			id: "sec-intro",
			title: "Introduction",
			role: "intro",
			slides: [
				{
					id: "s1",
					title: "Q3 Business Review",
					intent: { type: "title", keyMessage: "Q3 Performance", audienceTakeaway: "Context" },
					expectedLayout: "title",
					contentRequirements: [
						{ id: "cr1", description: "Title", expectedBlockType: "title", priority: "high" },
					],
				},
			],
		},
		{
			id: "sec-results",
			title: "Results",
			role: "result",
			slides: [
				{
					id: "s2",
					title: "Revenue & Growth",
					intent: { type: "data_insight", keyMessage: "Revenue up 15%", audienceTakeaway: "Strong quarter" },
					expectedLayout: "dashboard",
					contentRequirements: [
						{ id: "cr2", description: "Revenue chart", expectedBlockType: "chart", priority: "high" },
						{ id: "cr3", description: "KPI metrics", expectedBlockType: "metric", priority: "medium" },
					],
				},
				{
					id: "s3",
					title: "Key Challenges",
					intent: { type: "problem", keyMessage: "Supply chain delays", audienceTakeaway: "Need mitigation" },
					expectedLayout: "single_column",
					contentRequirements: [
						{ id: "cr4", description: "Issue breakdown", expectedBlockType: "bullet_list", priority: "high" },
					],
				},
			],
		},
		{
			id: "sec-next",
			title: "Next Steps",
			role: "proposal",
			slides: [
				{
					id: "s4",
					title: "Q4 Plan",
					intent: { type: "proposal", keyMessage: "Invest in automation", audienceTakeaway: "Approve budget" },
					expectedLayout: "single_column",
					contentRequirements: [
						{ id: "cr5", description: "Action items", expectedBlockType: "bullet_list", priority: "high" },
					],
				},
			],
		},
	],
};

describe("Phase 8I E2E: ParsedDeckPlan → IR", () => {
	it("converts ParsedDeckPlan → canonical → strategy pipeline → IR", async () => {
		// Step 1: Convert
		const { deckPlan, warnings: bridgeWarnings } =
			convertParsedDeckPlanToCanonicalDeckPlan({
				parsedDeckPlan: PARSED_DECK_PLAN,
				brief: BRIEF,
			});

		expect(deckPlan.slides).toHaveLength(4);
		expect(bridgeWarnings).toHaveLength(0);

		// Step 2: Strategy pipeline
		const pipelineResult = await runStrategyPipeline({ deckPlan });

		expect(pipelineResult.slideSpecs).toHaveLength(4);
		expect(pipelineResult.warnings.length).toBeLessThanOrEqual(5);

		// Each slideSpec should have strategyInput + preferredStrategyId
		for (const spec of pipelineResult.slideSpecs) {
			expect(spec.strategyInput).toBeDefined();
			expect(spec.preferredStrategyId).toBeDefined();
		}

		// Step 3: Build IR from DeckPlan
		const { presentation } = await buildPresentationIrFromDeckPlan({
			deckPlan,
		});

		expect(presentation.slides).toHaveLength(4);
		expect(presentation.meta.title).toBe("Q3 Business Review");

		// Step 4: Quality diagnostics
		const qualityReport = analyzeDeckStrategyQuality({ presentation });

		expect(qualityReport.summary.slideCount).toBe(4);
		// Native ratio should be high — all slides came through strategy pipeline
		expect(qualityReport.summary.nativeRatio).toBeGreaterThanOrEqual(0.5);
		expect(qualityReport.summary.status).not.toBe("fail");
	});

	it("strategy pipeline slideSpecs all carry strategyInput and preferredStrategyId", async () => {
		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: PARSED_DECK_PLAN,
			brief: BRIEF,
		});

		const pipelineResult = await runStrategyPipeline({ deckPlan });

		expect(pipelineResult.slideSpecs).toHaveLength(4);
		// All slideSpecs should have strategy metadata
		for (const spec of pipelineResult.slideSpecs) {
			expect(spec.strategyInput).toBeDefined();
			expect(spec.preferredStrategyId).toBeDefined();
			expect(spec.id).toBeTruthy();
		}

		// Build IR directly from deckPlan (pipeline runs internally)
		const { presentation } = await buildPresentationIrFromDeckPlan({
			deckPlan,
		});

		expect(presentation.slides).toHaveLength(4);
		// All slides should have elements (not empty)
		for (const slide of presentation.slides) {
			expect(slide.elements.length).toBeGreaterThan(0);
		}
	});
});

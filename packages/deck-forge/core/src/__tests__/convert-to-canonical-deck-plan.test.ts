import { describe, expect, it } from "vitest";
import { convertParsedDeckPlanToCanonicalDeckPlan } from "#src/pipeline/convert-to-canonical-deck-plan.js";
import type { ParsedDeckPlan, PresentationBrief } from "#src/schemas/intent-artifacts.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MINIMAL_BRIEF: PresentationBrief = {
	id: "brief-1",
	title: "Test Presentation",
	audience: { primary: "executive", expertiseLevel: "executive" },
	goal: { type: "inform", mainMessage: "Quarterly update", desiredOutcome: "Alignment" },
	tone: { formality: "business", energy: "calm", technicalDepth: "medium" },
	narrative: { structure: "analysis", arc: [{ role: "hook", message: "Overview" }] },
	output: { formats: ["pptx"], aspectRatio: "16:9", language: "en" },
	constraints: { slideCount: 3 },
	visualDirection: { style: "corporate", mood: "trustworthy" },
};

function makeParsedDeckPlan(
	overrides?: Partial<ParsedDeckPlan>,
): ParsedDeckPlan {
	return {
		id: "deck-1",
		briefId: "brief-1",
		title: "Test Deck",
		slideCountTarget: 2,
		globalStoryline: "Problem → Solution",
		sections: [
			{
				id: "sec-1",
				title: "Main",
				role: "analysis",
				slides: [
					{
						id: "slide-1",
						title: "Current State",
						intent: {
							type: "problem",
							keyMessage: "Revenue is declining",
							audienceTakeaway: "We need action",
						},
						expectedLayout: "single_column",
						contentRequirements: [
							{
								id: "cr-1",
								description: "Revenue chart",
								expectedBlockType: "chart",
								priority: "high",
							},
						],
					},
					{
						id: "slide-2",
						title: "Proposed Fix",
						intent: {
							type: "proposal",
							keyMessage: "New strategy",
							audienceTakeaway: "Approve the plan",
						},
						expectedLayout: "single_column",
						contentRequirements: [
							{
								id: "cr-2",
								description: "Action items",
								expectedBlockType: "bullet_list",
								priority: "high",
							},
						],
					},
				],
			},
		],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("convertParsedDeckPlanToCanonicalDeckPlan", () => {
	it("converts a basic ParsedDeckPlan to canonical DeckPlan", () => {
		const { deckPlan, warnings } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.id).toBe("deck-1");
		expect(deckPlan.title).toBe("Test Deck");
		expect(deckPlan.objective).toBe("Problem → Solution");
		expect(deckPlan.audience).toBe("executive");
		expect(deckPlan.genre).toBe("business-review");
		expect(deckPlan.density).toBe("medium");
		expect(deckPlan.slides).toHaveLength(2);
		expect(warnings).toHaveLength(0);
	});

	it("maps slide intent types to CommunicationIntent", () => {
		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.slides[0]!.intent).toBe("diagnose"); // problem → diagnose
		expect(deckPlan.slides[1]!.intent).toBe("persuade"); // proposal → persuade
	});

	it("preserves keyMessage and audienceTakeaway", () => {
		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.slides[0]!.keyMessage).toBe("Revenue is declining");
		expect(deckPlan.slides[0]!.audienceTakeaway).toBe("We need action");
	});

	it("infers contentKinds from contentRequirements", () => {
		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: MINIMAL_BRIEF,
		});

		// slide-1 has chart content requirement → "chart" kind + "root-cause" from intent
		expect(deckPlan.slides[0]!.contentKinds).toContain("chart");
		expect(deckPlan.slides[0]!.contentKinds).toContain("root-cause");
	});

	it("maps audience from brief", () => {
		const brief = { ...MINIMAL_BRIEF, audience: { primary: "engineer", expertiseLevel: "expert" as const } };
		const { deckPlan, warnings } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief,
		});

		expect(deckPlan.audience).toBe("engineer");
		expect(warnings).toHaveLength(0);
	});

	it("maps non-canonical audience with warning", () => {
		const brief = { ...MINIMAL_BRIEF, audience: { primary: "aliens", expertiseLevel: "intermediate" as const } };
		const { deckPlan, warnings } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief,
		});

		expect(deckPlan.audience).toBe("general");
		expect(warnings).toContainEqual(
			expect.stringContaining("Unknown audience"),
		);
	});

	it("maps genre from brief goal type", () => {
		const brief = {
			...MINIMAL_BRIEF,
			goal: { type: "persuade" as const, mainMessage: "Sell the plan", desiredOutcome: "Approval" },
		};
		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief,
		});

		expect(deckPlan.genre).toBe("sales-proposal");
	});

	it("warns on unknown intent type and defaults to explain", () => {
		const parsed = makeParsedDeckPlan();
		// @ts-expect-error — intentionally invalid type
		parsed.sections[0]!.slides[0]!.intent.type = "unknown_type";

		const { deckPlan, warnings } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: parsed,
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.slides[0]!.intent).toBe("explain");
		expect(warnings).toContainEqual(
			expect.stringContaining("Unknown intent type"),
		);
	});

	it("handles multiple sections by flattening slides", () => {
		const parsed = makeParsedDeckPlan({
			sections: [
				{
					id: "sec-1",
					title: "Intro",
					role: "intro",
					slides: [
						{
							id: "s1",
							title: "Title",
							intent: { type: "title", keyMessage: "Hello", audienceTakeaway: "Welcome" },
							expectedLayout: "title",
							contentRequirements: [],
						},
					],
				},
				{
					id: "sec-2",
					title: "Body",
					role: "analysis",
					slides: [
						{
							id: "s2",
							title: "Data",
							intent: { type: "data_insight", keyMessage: "Numbers", audienceTakeaway: "Trend" },
							expectedLayout: "dashboard",
							contentRequirements: [],
						},
						{
							id: "s3",
							title: "Close",
							intent: { type: "closing", keyMessage: "Thanks", audienceTakeaway: "Done" },
							expectedLayout: "single_column",
							contentRequirements: [],
						},
					],
				},
			],
		});

		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: parsed,
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.slides).toHaveLength(3);
		expect(deckPlan.slides[0]!.id).toBe("s1");
		expect(deckPlan.slides[1]!.id).toBe("s2");
		expect(deckPlan.slides[2]!.id).toBe("s3");
	});

	it("maps all 13 intent types without warnings", () => {
		const intentTypes = [
			"title", "agenda", "summary", "problem", "comparison",
			"timeline", "process", "architecture", "data_insight",
			"case_study", "proposal", "decision", "closing",
		] as const;

		for (const type of intentTypes) {
			const parsed = makeParsedDeckPlan({
				sections: [
					{
						id: "sec-1",
						title: "Test",
						role: "analysis",
						slides: [
							{
								id: `s-${type}`,
								title: type,
								intent: { type, keyMessage: "msg", audienceTakeaway: "take" },
								expectedLayout: "single_column",
								contentRequirements: [],
							},
						],
					},
				],
			});

			const { warnings } = convertParsedDeckPlanToCanonicalDeckPlan({
				parsedDeckPlan: parsed,
				brief: MINIMAL_BRIEF,
			});

			expect(warnings, `intent type "${type}" should not produce warnings`).toHaveLength(0);
		}
	});

	it("ensures at least one contentKind per slide", () => {
		const parsed = makeParsedDeckPlan({
			sections: [
				{
					id: "sec-1",
					title: "Test",
					role: "analysis",
					slides: [
						{
							id: "s1",
							title: "Empty",
							intent: { type: "title", keyMessage: "msg", audienceTakeaway: "take" },
							expectedLayout: "title",
							contentRequirements: [],
						},
					],
				},
			],
		});

		const { deckPlan } = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: parsed,
			brief: MINIMAL_BRIEF,
		});

		expect(deckPlan.slides[0]!.contentKinds.length).toBeGreaterThanOrEqual(1);
	});
});

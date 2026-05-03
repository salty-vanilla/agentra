/**
 * Phase 8J: Audience normalization tests.
 *
 * Validates that Japanese and business audience labels are correctly
 * mapped to canonical AudienceType values.
 */

import { describe, expect, it } from "vitest";
import { convertParsedDeckPlanToCanonicalDeckPlan } from "#src/pipeline/convert-to-canonical-deck-plan.js";

function makeBrief(audience: string) {
	return {
		id: "test",
		title: "Test",
		audience: { primary: audience, expertiseLevel: "intermediate" as const },
		goal: { type: "inform" as const, mainMessage: "", desiredOutcome: "" },
		tone: {
			formality: "business" as const,
			energy: "calm" as const,
			technicalDepth: "medium" as const,
		},
		narrative: { structure: "analysis" as const, arc: [] },
		output: { formats: ["pptx" as const], aspectRatio: "16:9" as const, language: "ja" },
		constraints: {},
		visualDirection: { style: "corporate" as const, mood: "trustworthy" as const },
	} as Parameters<typeof convertParsedDeckPlanToCanonicalDeckPlan>[0]["brief"];
}

function makeParsedDeckPlan() {
	return {
		id: "dp-1",
		briefId: "test",
		title: "Test",
		slideCountTarget: 1,
		globalStoryline: "Test storyline",
		sections: [
			{
				id: "s-1",
				title: "Section 1",
				role: "intro" as const,
				slides: [
					{
						id: "slide-1",
						title: "Test Slide",
						intent: {
							type: "summary" as const,
							keyMessage: "Test message",
							audienceTakeaway: "Test takeaway",
						},
						contentRequirements: [] as Array<{ description: string; expectedBlockType?: string }>,
					},
				],
			},
		],
	} as Parameters<typeof convertParsedDeckPlanToCanonicalDeckPlan>[0]["parsedDeckPlan"];
}

describe("Audience normalization", () => {
	it("maps 経営層（取締役・役員・部長級） to executive", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("経営層（取締役・役員・部長級）"),
		});
		expect(result.deckPlan.audience).toBe("executive");
		expect(result.warnings.filter((w) => w.includes("Unknown audience"))).toHaveLength(0);
	});

	it("maps 経営層 to executive (exact match)", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("経営層"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps 役員 to executive", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("役員"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps 取締役 to executive", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("取締役"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps CxO to executive", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("CxO"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps 開発者 to engineer", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("開発者"),
		});
		expect(result.deckPlan.audience).toBe("engineer");
	});

	it("maps エンジニア to engineer", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("エンジニア"),
		});
		expect(result.deckPlan.audience).toBe("engineer");
	});

	it("maps 製造現場 to operator", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("製造現場"),
		});
		expect(result.deckPlan.audience).toBe("operator");
	});

	it("maps 運用担当 to operator", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("運用担当"),
		});
		expect(result.deckPlan.audience).toBe("operator");
	});

	it("maps executive to executive (English)", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("executive"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps senior management to executive (substring)", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("Senior Management"),
		});
		expect(result.deckPlan.audience).toBe("executive");
	});

	it("maps unknown string to general with warning", () => {
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief: makeBrief("火星人"),
		});
		expect(result.deckPlan.audience).toBe("general");
		expect(result.warnings.some((w) => w.includes("Unknown audience"))).toBe(true);
	});

	it("defaults to general when audience is missing", () => {
		const brief = makeBrief("general");
		// @ts-expect-error - testing missing audience
		brief.audience = undefined;
		const result = convertParsedDeckPlanToCanonicalDeckPlan({
			parsedDeckPlan: makeParsedDeckPlan(),
			brief,
		});
		expect(result.deckPlan.audience).toBe("general");
	});
});

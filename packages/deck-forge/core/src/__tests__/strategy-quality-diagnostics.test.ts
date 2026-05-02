/**
 * Phase 8G tests: Strategy quality diagnostics.
 */
import { describe, expect, it } from "vitest";

import {
	analyzeSlideStrategyQuality,
	analyzeDeckStrategyQuality,
	formatDeckStrategyQualityReport,
} from "#src/diagnostics/strategy-quality-diagnostics.js";
import type { PresentationIR, SlideIR } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<SlideIR> = {}): SlideIR {
	return {
		id: "slide-1",
		index: 0,
		title: "Test Slide",
		layout: { regions: [], resolvedSize: { width: 1280, height: 720 } },
		elements: [
			{
				id: "title-el",
				type: "text",
				role: "title",
				text: { paragraphs: [{ runs: [{ text: "Title" }] }] },
				frame: { x: 60, y: 30, width: 1160, height: 60 },
				style: { fontSize: 28 },
			},
			{
				id: "body-el",
				type: "text",
				role: "body",
				text: { paragraphs: [{ runs: [{ text: "Body content here." }] }] },
				frame: { x: 60, y: 110, width: 1160, height: 500 },
				style: { fontSize: 14 },
			},
		],
		_trace: {
			layoutStrategyId: "kpi-card-overview",
			layoutSpecType: "single_column",
			templateProfileId: "executive-navy",
			templateLayoutId: "content-standard",
			templateLayoutKind: "content",
			usedSlots: ["body"],
			fallbackSlots: [],
			strategyInputMode: "native",
			strategyInputSource: "deterministic",
		},
		...overrides,
	} as SlideIR;
}

function makePresentation(slides: SlideIR[]): PresentationIR {
	return {
		id: "deck-1",
		version: "1.0.0",
		meta: { title: "Test Deck", author: "Test", createdAt: "2025-01-01" },
		theme: {},
		slides,
		assets: { assets: [] },
		operationLog: [],
	} as unknown as PresentationIR;
}

// ---------------------------------------------------------------------------
// 9.1 — Slide-level trace diagnostics
// ---------------------------------------------------------------------------

describe("slide-level trace diagnostics", () => {
	it("native slide → no strategyInput issue", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.native).toBe(true);
		expect(report.issues.filter((i) => i.code === "strategy-input-invalid")).toHaveLength(0);
		expect(report.issues.filter((i) => i.code === "strategy-input-missing")).toHaveLength(0);
		expect(report.issues.filter((i) => i.code === "legacy-fallback-used")).toHaveLength(0);
	});

	it("legacy-fallback slide → warning", () => {
		const slide = makeSlide({
			_trace: {
				layoutStrategyId: "kpi-card-overview",
				layoutSpecType: "single_column",
				templateProfileId: "executive-navy",
				templateLayoutId: "content-standard",
				templateLayoutKind: "content",
				usedSlots: ["body"],
				fallbackSlots: [],
				strategyInputMode: "legacy-fallback",
			},
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.fallback).toBe(true);
		const fallbackIssue = report.issues.find((i) => i.code === "legacy-fallback-used");
		expect(fallbackIssue).toBeDefined();
		expect(fallbackIssue!.severity).toBe("warning");
	});

	it("invalid slide → error", () => {
		const slide = makeSlide({
			_trace: {
				layoutStrategyId: "two-axis-matrix",
				layoutSpecType: "matrix",
				templateProfileId: "executive-navy",
				templateLayoutId: "content-standard",
				templateLayoutKind: "content",
				usedSlots: [],
				fallbackSlots: [],
				strategyInputMode: "invalid",
			},
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.invalid).toBe(true);
		const invalidIssue = report.issues.find((i) => i.code === "strategy-input-invalid");
		expect(invalidIssue).toBeDefined();
		expect(invalidIssue!.severity).toBe("error");
	});

	it("missing trace → warning", () => {
		const slide = makeSlide({ _trace: undefined } as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const traceIssue = report.issues.find((i) => i.code === "missing-strategy-trace");
		expect(traceIssue).toBeDefined();
		expect(traceIssue!.severity).toBe("warning");
	});
});

// ---------------------------------------------------------------------------
// 9.2 — Empty / missing title
// ---------------------------------------------------------------------------

describe("empty slide / missing title detection", () => {
	it("slide with no elements → empty-slide", () => {
		const slide = makeSlide({ elements: [] });
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const emptyIssue = report.issues.find((i) => i.code === "empty-slide");
		expect(emptyIssue).toBeDefined();
		expect(emptyIssue!.severity).toBe("error");
	});

	it("slide with no title → missing-title", () => {
		const slide = makeSlide({
			title: undefined,
			elements: [
				{
					id: "body-el",
					type: "text",
					role: "body",
					text: { paragraphs: [{ runs: [{ text: "Content" }] }] },
					frame: { x: 60, y: 110, width: 1160, height: 500 },
					style: { fontSize: 14 },
				},
			],
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const titleIssue = report.issues.find((i) => i.code === "missing-title");
		expect(titleIssue).toBeDefined();
		expect(titleIssue!.severity).toBe("warning");
	});

	it("normal slide → no empty/title issues", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.issues.filter((i) => i.code === "empty-slide")).toHaveLength(0);
		expect(report.issues.filter((i) => i.code === "missing-title")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 9.3 — Text overflow risk
// ---------------------------------------------------------------------------

describe("text overflow risk", () => {
	it("long text in small frame → text-overflow-risk", () => {
		const longText = "A".repeat(2000);
		const slide = makeSlide({
			elements: [
				{
					id: "title-el",
					type: "text",
					role: "title",
					text: { paragraphs: [{ runs: [{ text: "Title" }] }] },
					frame: { x: 60, y: 30, width: 1160, height: 60 },
					style: { fontSize: 28 },
				},
				{
					id: "overflow-el",
					type: "text",
					role: "body",
					text: { paragraphs: [{ runs: [{ text: longText }] }] },
					frame: { x: 60, y: 110, width: 400, height: 80 },
					style: { fontSize: 14 },
				},
			],
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const overflowIssue = report.issues.find((i) => i.code === "text-overflow-risk");
		expect(overflowIssue).toBeDefined();
		expect(overflowIssue!.severity).toBe("warning");
	});

	it("short text in adequate frame → no overflow issue", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.issues.filter((i) => i.code === "text-overflow-risk")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 9.4 — Out-of-bounds
// ---------------------------------------------------------------------------

describe("out-of-bounds detection", () => {
	it("element outside slide → out-of-bounds", () => {
		const slide = makeSlide({
			elements: [
				{
					id: "title-el",
					type: "text",
					role: "title",
					text: { paragraphs: [{ runs: [{ text: "Title" }] }] },
					frame: { x: 60, y: 30, width: 1160, height: 60 },
					style: { fontSize: 28 },
				},
				{
					id: "oob-el",
					type: "text",
					role: "body",
					text: { paragraphs: [{ runs: [{ text: "Out" }] }] },
					frame: { x: 1200, y: 600, width: 200, height: 200 },
					style: { fontSize: 14 },
				},
			],
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const oobIssue = report.issues.find((i) => i.code === "out-of-bounds");
		expect(oobIssue).toBeDefined();
		expect(oobIssue!.severity).toBe("warning");
	});

	it("normal element → no out-of-bounds issue", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.issues.filter((i) => i.code === "out-of-bounds")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 9.5 — Overlap risk
// ---------------------------------------------------------------------------

describe("overlap risk", () => {
	it("overlapping non-decorative elements → overlap-risk", () => {
		const slide = makeSlide({
			elements: [
				{
					id: "title-el",
					type: "text",
					role: "title",
					text: { paragraphs: [{ runs: [{ text: "Title" }] }] },
					frame: { x: 60, y: 30, width: 1160, height: 60 },
					style: { fontSize: 28 },
				},
				{
					id: "el-a",
					type: "text",
					role: "body",
					text: { paragraphs: [{ runs: [{ text: "A" }] }] },
					frame: { x: 100, y: 200, width: 400, height: 300 },
					style: { fontSize: 14 },
				},
				{
					id: "el-b",
					type: "text",
					role: "body",
					text: { paragraphs: [{ runs: [{ text: "B" }] }] },
					frame: { x: 100, y: 200, width: 400, height: 300 },
					style: { fontSize: 14 },
				},
			],
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		const overlapIssue = report.issues.find((i) => i.code === "overlap-risk");
		expect(overlapIssue).toBeDefined();
		expect(overlapIssue!.severity).toBe("warning");
	});

	it("separated elements → no overlap issue", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.issues.filter((i) => i.code === "overlap-risk")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 9.6 — Deck-level ratios
// ---------------------------------------------------------------------------

describe("deck-level ratios", () => {
	it("all native slides → nativeRatio 1.0", () => {
		const slides = [makeSlide(), makeSlide({ id: "slide-2" })];
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.nativeRatio).toBe(1.0);
		expect(report.summary.fallbackRatio).toBe(0);
		expect(report.summary.invalidRatio).toBe(0);
	});

	it("mixed native/fallback → correct ratios", () => {
		const nativeSlide = makeSlide();
		const fallbackSlide = makeSlide({
			id: "slide-2",
			_trace: {
				layoutStrategyId: "kpi-card-overview",
				layoutSpecType: "single_column",
				templateProfileId: "executive-navy",
				templateLayoutId: "content-standard",
				templateLayoutKind: "content",
				usedSlots: [],
				fallbackSlots: [],
				strategyInputMode: "legacy-fallback",
			},
		} as Partial<SlideIR>);
		const pres = makePresentation([nativeSlide, fallbackSlide]);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.nativeRatio).toBe(0.5);
		expect(report.summary.fallbackRatio).toBe(0.5);
	});

	it("invalid slides → invalidRatio correct", () => {
		const invalidSlide = makeSlide({
			_trace: {
				layoutStrategyId: "two-axis-matrix",
				layoutSpecType: "matrix",
				templateProfileId: "executive-navy",
				templateLayoutId: "content-standard",
				templateLayoutKind: "content",
				usedSlots: [],
				fallbackSlots: [],
				strategyInputMode: "invalid",
			},
		} as Partial<SlideIR>);
		const pres = makePresentation([makeSlide(), invalidSlide]);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.invalidRatio).toBe(0.5);
	});
});

// ---------------------------------------------------------------------------
// 9.7 — Quality gate status
// ---------------------------------------------------------------------------

describe("quality gate status", () => {
	it("clean deck → pass", () => {
		const slides = [makeSlide(), makeSlide({ id: "slide-2" })];
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.status).toBe("pass");
	});

	it("fallback-heavy deck → warn", () => {
		const slides = Array.from({ length: 5 }, (_, i) =>
			makeSlide({
				id: `slide-${i}`,
				_trace: {
					layoutStrategyId: "kpi-card-overview",
					layoutSpecType: "single_column",
					templateProfileId: "executive-navy",
					templateLayoutId: "content-standard",
					templateLayoutKind: "content",
					usedSlots: [],
					fallbackSlots: [],
					strategyInputMode: "legacy-fallback",
				},
			} as Partial<SlideIR>),
		);
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.status).toBe("warn");
	});

	it("invalid deck → fail", () => {
		const slides = [
			makeSlide({
				id: "slide-0",
				elements: [], // empty → error
				_trace: {
					layoutStrategyId: "two-axis-matrix",
					layoutSpecType: "matrix",
					templateProfileId: "executive-navy",
					templateLayoutId: "content-standard",
					templateLayoutKind: "content",
					usedSlots: [],
					fallbackSlots: [],
					strategyInputMode: "invalid",
				},
			} as Partial<SlideIR>),
		];
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		expect(report.summary.status).toBe("fail");
	});
});

// ---------------------------------------------------------------------------
// 9.8 — Formatting
// ---------------------------------------------------------------------------

describe("diagnostics formatting", () => {
	it("formatted report includes status, score, ratios, and top issues", () => {
		const slides = [
			makeSlide(),
			makeSlide({
				id: "slide-2",
				_trace: {
					layoutStrategyId: "kpi-card-overview",
					layoutSpecType: "single_column",
					templateProfileId: "executive-navy",
					templateLayoutId: "content-standard",
					templateLayoutKind: "content",
					usedSlots: [],
					fallbackSlots: [],
					strategyInputMode: "legacy-fallback",
				},
			} as Partial<SlideIR>),
		];
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		const formatted = formatDeckStrategyQualityReport(report);
		expect(formatted).toContain("Status:");
		expect(formatted).toContain("Score:");
		expect(formatted).toContain("Native ratio:");
		expect(formatted).toContain("Fallback ratio:");
	});

	it("clean deck report shows no issues", () => {
		const slides = [makeSlide(), makeSlide({ id: "slide-2" })];
		const pres = makePresentation(slides);
		const report = analyzeDeckStrategyQuality({ presentation: pres });
		const formatted = formatDeckStrategyQualityReport(report);
		expect(formatted).toContain("No issues found.");
	});
});

// ---------------------------------------------------------------------------
// 9.9 — Score computation
// ---------------------------------------------------------------------------

describe("slide score computation", () => {
	it("native slide with no issues → high score", () => {
		const slide = makeSlide();
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.score).toBeGreaterThanOrEqual(90);
	});

	it("invalid slide → low score", () => {
		const slide = makeSlide({
			elements: [],
			_trace: {
				layoutStrategyId: "two-axis-matrix",
				layoutSpecType: "matrix",
				templateProfileId: "executive-navy",
				templateLayoutId: "content-standard",
				templateLayoutKind: "content",
				usedSlots: [],
				fallbackSlots: [],
				strategyInputMode: "invalid",
			},
		} as Partial<SlideIR>);
		const report = analyzeSlideStrategyQuality({ slide, slideIndex: 0 });
		expect(report.score).toBeLessThanOrEqual(40);
	});
});

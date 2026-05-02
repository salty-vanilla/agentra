/**
 * Strategy quality diagnostics — deterministic slide-level and deck-level
 * quality analysis for StrategyInput pipeline health.
 *
 * Phase 8G: Diagnostics, Quality Gates, and Preview Validation.
 *
 * Uses IR, SlideIR trace, StrategyInput trace, and ElementIR frames.
 * No VLM or LLM calls. No PPTX rendering. Fully deterministic.
 *
 * TODO(Phase 8H+): connect this deterministic report with rendered slide
 * previews and optional VLM review.
 */

import type { ElementIR, PresentationIR, SlideIR } from "#src/index.js";
import { frameOverlapRatio } from "#src/geometry/frame-geometry.js";
import { estimateTextBoxHeight } from "#src/measurement/text-measurement.js";
import { richTextToPlainText } from "#src/measurement/rich-text-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyQualitySeverity = "info" | "warning" | "error";

export type StrategyQualityIssueCode =
	| "strategy-input-invalid"
	| "strategy-input-missing"
	| "legacy-fallback-used"
	| "native-ratio-low"
	| "fallback-ratio-high"
	| "missing-title"
	| "empty-slide"
	| "text-overflow-risk"
	| "too-many-elements"
	| "too-dense"
	| "out-of-bounds"
	| "overlap-risk"
	| "missing-key-message"
	| "missing-strategy-trace"
	| "low-content-signal"
	| "schema-warning"
	| "unknown";

export interface StrategyQualityIssue {
	code: StrategyQualityIssueCode;
	severity: StrategyQualitySeverity;
	message: string;
	slideId?: string;
	slideIndex?: number;
	target?: string;
	recommendation?: string;
}

export interface SlideStrategyQualityReport {
	slideId: string;
	slideIndex: number;
	title?: string;
	strategyId?: string;
	strategyInputMode?: string;
	strategyInputSource?: string;
	native: boolean;
	fallback: boolean;
	invalid: boolean;
	elementCount: number;
	textElementCount: number;
	issues: StrategyQualityIssue[];
	score: number;
}

export interface DeckStrategyQualitySummary {
	slideCount: number;
	nativeSlideCount: number;
	fallbackSlideCount: number;
	invalidSlideCount: number;
	missingSlideCount: number;
	nativeRatio: number;
	fallbackRatio: number;
	invalidRatio: number;
	issueCount: number;
	errorCount: number;
	warningCount: number;
	infoCount: number;
	score: number;
	status: "pass" | "warn" | "fail";
}

export interface DeckStrategyQualityReport {
	summary: DeckStrategyQualitySummary;
	slides: SlideStrategyQualityReport[];
	issues: StrategyQualityIssue[];
}

export interface StrategyQualityThresholds {
	minNativeRatio: number;
	maxFallbackRatio: number;
	maxInvalidRatio: number;
	minDeckScore: number;
	minSlideScore: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: StrategyQualityThresholds = {
	minNativeRatio: 0.8,
	maxFallbackRatio: 0.2,
	maxInvalidRatio: 0,
	minDeckScore: 75,
	minSlideScore: 60,
};

const DEFAULT_SLIDE_SIZE = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------
// Slide-level diagnostics
// ---------------------------------------------------------------------------

export function analyzeSlideStrategyQuality(input: {
	slide: SlideIR;
	slideIndex: number;
	slideSize?: { width: number; height: number };
}): SlideStrategyQualityReport {
	const { slide, slideIndex, slideSize = DEFAULT_SLIDE_SIZE } = input;
	const trace = slide._trace;
	const issues: StrategyQualityIssue[] = [];

	const mode = trace?.strategyInputMode;
	const native = mode === "native";
	const fallback = mode === "legacy-fallback" || mode === "invalid-fallback";
	const invalid = mode === "invalid" || mode === "invalid-fallback";

	const elements = slide.elements;
	const textElements = elements.filter((e) => e.type === "text");
	const elementCount = elements.length;
	const textElementCount = textElements.length;

	// --- 2.1: StrategyInput trace checks ---
	if (!trace) {
		issues.push({
			code: "missing-strategy-trace",
			severity: "warning",
			message: "Slide has no _trace metadata.",
			slideId: slide.id,
			slideIndex,
			recommendation: "Ensure slide is built through buildPresentationIr().",
		});
	} else {
		if (mode === "invalid") {
			issues.push({
				code: "strategy-input-invalid",
				severity: "error",
				message: `StrategyInput validation failed for strategy "${trace.layoutStrategyId}".`,
				slideId: slide.id,
				slideIndex,
				target: trace.layoutStrategyId,
				recommendation: "Fix strategyInput schema or provide valid input.",
			});
		} else if (mode === "invalid-fallback") {
			issues.push({
				code: "strategy-input-invalid",
				severity: "warning",
				message: `StrategyInput invalid for "${trace.layoutStrategyId}"; used legacy contentBlocks fallback.`,
				slideId: slide.id,
				slideIndex,
				target: trace.layoutStrategyId,
				recommendation: "Fix strategyInput to use native rendering path.",
			});
		} else if (mode === "missing") {
			issues.push({
				code: "strategy-input-missing",
				severity: "warning",
				message: `No strategyInput provided for "${trace.layoutStrategyId}".`,
				slideId: slide.id,
				slideIndex,
				target: trace.layoutStrategyId,
				recommendation: "Connect StrategyInput generation pipeline.",
			});
		} else if (mode === "legacy-fallback") {
			issues.push({
				code: "legacy-fallback-used",
				severity: "warning",
				message: `Legacy contentBlocks fallback used for "${trace.layoutStrategyId}".`,
				slideId: slide.id,
				slideIndex,
				target: trace.layoutStrategyId,
				recommendation: "Provide strategyInput for native rendering.",
			});
		}

		if (trace.strategyInputWarnings && trace.strategyInputWarnings.length > 0) {
			for (const w of trace.strategyInputWarnings) {
				issues.push({
					code: "schema-warning",
					severity: "info",
					message: w,
					slideId: slide.id,
					slideIndex,
				});
			}
		}
	}

	// --- 2.2: Empty slide detection ---
	const nonDecorativeElements = elements.filter(
		(e) => !(e.type === "shape" && (e as { role?: string }).role === "decorative"),
	);
	if (nonDecorativeElements.length === 0) {
		issues.push({
			code: "empty-slide",
			severity: "error",
			message: "Slide has no content elements.",
			slideId: slide.id,
			slideIndex,
			recommendation: "Add content or remove empty slide.",
		});
	}

	// --- 2.3: Missing title detection ---
	const layoutKind = trace?.templateLayoutKind;
	const isCoverOrSection = layoutKind === "cover" || layoutKind === "section";
	if (!isCoverOrSection) {
		const hasTitleElement = textElements.some(
			(e) => (e as { role?: string }).role === "title",
		);
		const hasSlideTitle = !!slide.title;
		if (!hasTitleElement && !hasSlideTitle) {
			issues.push({
				code: "missing-title",
				severity: "warning",
				message: "Slide has no title element or title metadata.",
				slideId: slide.id,
				slideIndex,
				recommendation: "Add a title element or set slide.title.",
			});
		}
	}

	// --- 2.4: Missing key message ---
	if (slide.intent && (!slide.intent.keyMessage || slide.intent.keyMessage.trim() === "")) {
		issues.push({
			code: "missing-key-message",
			severity: "info",
			message: "Slide intent exists but keyMessage is empty.",
			slideId: slide.id,
			slideIndex,
			recommendation: "Add a keyMessage to the slide intent.",
		});
	}

	// --- 2.5: Text overflow risk ---
	for (const el of textElements) {
		const textEl = el as { text?: unknown; frame: { width: number; height: number }; style?: { fontSize?: number; lineHeight?: number } };
		if (textEl.text && textEl.frame) {
			const plainText = richTextToPlainText(textEl.text as never);
			if (plainText.length > 0) {
				const fontSize = textEl.style?.fontSize ?? 14;
				const lineHeight = textEl.style?.lineHeight ?? 1.4;
				const estimated = estimateTextBoxHeight({
					text: plainText,
					width: textEl.frame.width,
					fontSize,
					lineHeight,
				});
				if (estimated > textEl.frame.height * 0.95) {
					issues.push({
						code: "text-overflow-risk",
						severity: "warning",
						message: `Text element "${el.id}" may overflow (estimated ${Math.round(estimated)}px > frame ${Math.round(textEl.frame.height)}px).`,
						slideId: slide.id,
						slideIndex,
						target: el.id,
						recommendation: "Reduce text, increase frame size, or decrease font size.",
					});
				}
			}
		}
	}

	// --- 2.6: Too many elements ---
	if (elementCount > 45) {
		issues.push({
			code: "too-many-elements",
			severity: "error",
			message: `Slide has ${elementCount} elements (> 45).`,
			slideId: slide.id,
			slideIndex,
			recommendation: "Split content across multiple slides.",
		});
	} else if (elementCount > 30) {
		issues.push({
			code: "too-many-elements",
			severity: "warning",
			message: `Slide has ${elementCount} elements (> 30).`,
			slideId: slide.id,
			slideIndex,
			recommendation: "Consider simplifying or splitting.",
		});
	}

	// --- 2.7: Too dense ---
	const totalTextLength = textElements.reduce((sum, el) => {
		const textEl = el as { text?: unknown };
		if (textEl.text) return sum + richTextToPlainText(textEl.text as never).length;
		return sum;
	}, 0);
	if (totalTextLength > 1200 || textElementCount > 14 || elementCount > 35) {
		issues.push({
			code: "too-dense",
			severity: "warning",
			message: `Slide is too dense (${totalTextLength} chars, ${textElementCount} text elements, ${elementCount} total).`,
			slideId: slide.id,
			slideIndex,
			recommendation: "Reduce content density or split into multiple slides.",
		});
	}

	// --- 2.8: Out-of-bounds ---
	for (const el of elements) {
		const f = el.frame;
		if (f.x < 0 || f.y < 0 || f.x + f.width > slideSize.width || f.y + f.height > slideSize.height) {
			issues.push({
				code: "out-of-bounds",
				severity: "warning",
				message: `Element "${el.id}" extends outside slide bounds.`,
				slideId: slide.id,
				slideIndex,
				target: el.id,
				recommendation: "Adjust element position or size to fit within slide.",
			});
		}
	}

	// --- 2.9: Overlap risk ---
	const nonDecFrames = nonDecorativeElements.map((e) => ({ id: e.id, frame: e.frame }));
	for (let i = 0; i < nonDecFrames.length; i++) {
		for (let j = i + 1; j < nonDecFrames.length; j++) {
			const ratio = frameOverlapRatio(nonDecFrames[i]!.frame, nonDecFrames[j]!.frame);
			if (ratio > 0.3) {
				issues.push({
					code: "overlap-risk",
					severity: "warning",
					message: `Elements "${nonDecFrames[i]!.id}" and "${nonDecFrames[j]!.id}" overlap significantly (${Math.round(ratio * 100)}%).`,
					slideId: slide.id,
					slideIndex,
					target: `${nonDecFrames[i]!.id},${nonDecFrames[j]!.id}`,
					recommendation: "Reposition overlapping elements.",
				});
				break; // one overlap issue per slide is enough
			}
		}
		if (issues.some((i) => i.code === "overlap-risk")) break;
	}

	// --- Score ---
	const score = computeSlideScore(issues, mode);

	return {
		slideId: slide.id,
		slideIndex,
		title: slide.title,
		strategyId: trace?.layoutStrategyId,
		strategyInputMode: mode,
		strategyInputSource: trace?.strategyInputSource,
		native,
		fallback,
		invalid,
		elementCount,
		textElementCount,
		issues,
		score,
	};
}

function computeSlideScore(
	issues: StrategyQualityIssue[],
	mode?: string,
): number {
	let score = 100;

	for (const issue of issues) {
		if (issue.severity === "error") score -= 25;
		else if (issue.severity === "warning") score -= 10;
		else score -= 2;
	}

	// Mode penalties (in addition to issue penalties)
	if (mode === "legacy-fallback") score -= 10;
	else if (mode === "invalid-fallback") score -= 20;
	else if (mode === "invalid") score -= 35;
	else if (mode === "missing") score -= 15;

	return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Deck-level diagnostics
// ---------------------------------------------------------------------------

export function analyzeDeckStrategyQuality(input: {
	presentation: PresentationIR;
	slideSize?: { width: number; height: number };
	thresholds?: Partial<StrategyQualityThresholds>;
}): DeckStrategyQualityReport {
	const { presentation, slideSize, thresholds: customThresholds } = input;
	const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

	const slideReports = presentation.slides.map((slide, index) =>
		analyzeSlideStrategyQuality({ slide, slideIndex: index, slideSize }),
	);

	const slideCount = slideReports.length;
	const nativeSlideCount = slideReports.filter((r) => r.native).length;
	const fallbackSlideCount = slideReports.filter((r) => r.fallback).length;
	const invalidSlideCount = slideReports.filter((r) => r.invalid).length;
	const missingSlideCount = slideReports.filter(
		(r) => r.strategyInputMode === "missing",
	).length;

	const nativeRatio = slideCount > 0 ? nativeSlideCount / slideCount : 0;
	const fallbackRatio = slideCount > 0 ? fallbackSlideCount / slideCount : 0;
	const invalidRatio = slideCount > 0 ? invalidSlideCount / slideCount : 0;

	// Collect all issues
	const allIssues: StrategyQualityIssue[] = slideReports.flatMap((r) => r.issues);

	// Deck-level issues
	if (nativeRatio < thresholds.minNativeRatio && slideCount > 0) {
		allIssues.push({
			code: "native-ratio-low",
			severity: "warning",
			message: `Native ratio ${(nativeRatio * 100).toFixed(0)}% is below threshold ${(thresholds.minNativeRatio * 100).toFixed(0)}%.`,
			recommendation: "Ensure StrategyInput generation covers more slides.",
		});
	}
	if (fallbackRatio > thresholds.maxFallbackRatio && slideCount > 0) {
		allIssues.push({
			code: "fallback-ratio-high",
			severity: "warning",
			message: `Fallback ratio ${(fallbackRatio * 100).toFixed(0)}% exceeds threshold ${(thresholds.maxFallbackRatio * 100).toFixed(0)}%.`,
			recommendation: "Reduce reliance on legacy contentBlocks fallback.",
		});
	}

	const errorCount = allIssues.filter((i) => i.severity === "error").length;
	const warningCount = allIssues.filter((i) => i.severity === "warning").length;
	const infoCount = allIssues.filter((i) => i.severity === "info").length;

	// Deck score = average of slide scores
	const deckScore =
		slideCount > 0
			? Math.round(slideReports.reduce((sum, r) => sum + r.score, 0) / slideCount)
			: 100;

	// Quality gate status
	const status = computeQualityGateStatus({
		deckScore,
		slideReports,
		errorCount,
		invalidRatio,
		fallbackRatio,
		nativeRatio,
		thresholds,
	});

	return {
		summary: {
			slideCount,
			nativeSlideCount,
			fallbackSlideCount,
			invalidSlideCount,
			missingSlideCount,
			nativeRatio,
			fallbackRatio,
			invalidRatio,
			issueCount: allIssues.length,
			errorCount,
			warningCount,
			infoCount,
			score: deckScore,
			status,
		},
		slides: slideReports,
		issues: allIssues,
	};
}

function computeQualityGateStatus(input: {
	deckScore: number;
	slideReports: SlideStrategyQualityReport[];
	errorCount: number;
	invalidRatio: number;
	fallbackRatio: number;
	nativeRatio: number;
	thresholds: StrategyQualityThresholds;
}): "pass" | "warn" | "fail" {
	const { deckScore, slideReports, errorCount, invalidRatio, fallbackRatio, nativeRatio, thresholds } = input;

	// Fail conditions
	if (errorCount > 0) return "fail";
	if (invalidRatio > thresholds.maxInvalidRatio) return "fail";
	if (deckScore < thresholds.minDeckScore - 15) return "fail";
	if (slideReports.some((r) => r.score < 40)) return "fail";

	// Warn conditions
	if (fallbackRatio > thresholds.maxFallbackRatio) return "warn";
	if (nativeRatio < thresholds.minNativeRatio) return "warn";
	if (deckScore < thresholds.minDeckScore) return "warn";

	return "pass";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDeckStrategyQualityReport(
	report: DeckStrategyQualityReport,
): string {
	const { summary } = report;
	const lines: string[] = [];

	lines.push(`Status: ${summary.status}`);
	lines.push(`Score: ${summary.score}`);
	lines.push(`Native ratio: ${summary.nativeRatio.toFixed(2)}`);
	lines.push(`Fallback ratio: ${summary.fallbackRatio.toFixed(2)}`);
	lines.push(`Invalid slides: ${summary.invalidSlideCount}`);
	lines.push(`Missing slides: ${summary.missingSlideCount}`);
	lines.push("");

	const topIssues = report.issues
		.filter((i) => i.severity === "error" || i.severity === "warning")
		.slice(0, 10);

	if (topIssues.length > 0) {
		lines.push("Top issues:");
		for (const issue of topIssues) {
			const loc = issue.slideIndex != null ? `[slide ${issue.slideIndex}] ` : "";
			lines.push(`- ${loc}${issue.code}: ${issue.message}`);
		}
	} else {
		lines.push("No issues found.");
	}

	return lines.join("\n");
}

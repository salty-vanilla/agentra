/**
 * Phase 8J: LLM StrategyInput generator tests.
 *
 * Tests the LlmFirstStrategyInputGenerator, stripForbiddenKeys,
 * and prompt builder utilities.
 */

import { describe, expect, it, vi } from "vitest";
import {
	LlmFirstStrategyInputGenerator,
	stripForbiddenKeys,
	buildLlmStrategyInputSystemPrompt,
	buildLlmStrategyInputUserMessage,
} from "#src/strategy/llm-strategy-input-generator.js";
import type {
	LlmStrategyInputGenerationRequest,
	LlmStrategyInputGenerationResult,
} from "#src/strategy/llm-strategy-input-generator.js";
import { createBuiltinStrategyRegistry } from "#src/strategy/index.js";
import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";

function makeResolvedIntent(
	overrides?: Partial<ResolvedSlideIntent>,
): ResolvedSlideIntent {
	return {
		id: "slide-1",
		keyMessage: "Q2 KPI達成状況",
		audienceTakeaway: "全KPIが目標達成",
		intent: "report",
		contentKinds: ["kpi"],
		audience: "executive",
		genre: "business-review",
		density: "medium",
		...overrides,
	};
}

describe("stripForbiddenKeys", () => {
	it("strips layout/styling keys from flat object", () => {
		const { cleaned, strippedKeys } = stripForbiddenKeys({
			headline: "Test",
			x: 100,
			y: 200,
			width: 400,
			height: 300,
			fontSize: 14,
			color: "#000",
		});
		expect(cleaned).toEqual({ headline: "Test" });
		expect(strippedKeys).toContain("x");
		expect(strippedKeys).toContain("y");
		expect(strippedKeys).toContain("fontSize");
		expect(strippedKeys).toContain("color");
	});

	it("strips nested forbidden keys", () => {
		const { cleaned, strippedKeys } = stripForbiddenKeys({
			headline: "Test",
			metrics: [
				{ label: "A", value: "100", fill: "#red" },
				{ label: "B", value: "200", x: 10, y: 20 },
			],
		});
		expect(cleaned).toEqual({
			headline: "Test",
			metrics: [
				{ label: "A", value: "100" },
				{ label: "B", value: "200" },
			],
		});
		expect(strippedKeys).toContain("fill");
		expect(strippedKeys).toContain("x");
	});

	it("preserves valid object when no forbidden keys", () => {
		const input = { headline: "Test", metrics: [{ label: "A", value: "100" }] };
		const { cleaned, strippedKeys } = stripForbiddenKeys(input);
		expect(cleaned).toEqual(input);
		expect(strippedKeys).toHaveLength(0);
	});

	it("handles null and undefined gracefully", () => {
		expect(stripForbiddenKeys(null).cleaned).toBeNull();
		expect(stripForbiddenKeys(undefined).cleaned).toBeUndefined();
	});
});

describe("LlmFirstStrategyInputGenerator", () => {
	const registry = createBuiltinStrategyRegistry();

	it("returns LLM result when generation succeeds", async () => {
		const mockLlmFn = vi.fn<
			(req: LlmStrategyInputGenerationRequest) => Promise<LlmStrategyInputGenerationResult>
		>().mockResolvedValue({
			strategyInput: {
				headline: "Q2 KPI Dashboard",
				metrics: [
					{ label: "生産量", value: "15,200台", trend: "up" },
					{ label: "不良率", value: "1.2%", trend: "down" },
					{ label: "稼働率", value: "94.5%", trend: "flat" },
				],
			},
			source: "llm",
			warnings: [],
		});

		const generator = new LlmFirstStrategyInputGenerator({
			llmGenerateFn: mockLlmFn,
			registry,
			mode: "llm",
			slideCount: 6,
		});

		const result = await generator.generate({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: ["kpi-card-overview"],
				warnings: [],
			},
		});

		expect(result.source).toBe("llm");
		expect(result.strategyId).toBe("kpi-card-overview");
		expect((result.input as Record<string, unknown>).headline).toBe("Q2 KPI Dashboard");
		expect(mockLlmFn).toHaveBeenCalledOnce();
	});

	it("falls back to deterministic on LLM validation failure", async () => {
		const mockLlmFn = vi.fn<
			(req: LlmStrategyInputGenerationRequest) => Promise<LlmStrategyInputGenerationResult>
		>().mockResolvedValue({
			// Invalid: missing required fields
			strategyInput: { invalid: true },
			source: "llm",
			warnings: [],
		});

		const generator = new LlmFirstStrategyInputGenerator({
			llmGenerateFn: mockLlmFn,
			registry,
			mode: "llm",
			slideCount: 1,
		});

		const result = await generator.generate({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: ["kpi-card-overview"],
				warnings: [],
			},
		});

		// Should fall back to deterministic
		expect(result.source).toBe("fallback");
		expect(result.warnings.some((w) => w.includes("failed validation"))).toBe(true);
	});

	it("falls back to deterministic on LLM error", async () => {
		const mockLlmFn = vi.fn<
			(req: LlmStrategyInputGenerationRequest) => Promise<LlmStrategyInputGenerationResult>
		>().mockRejectedValue(new Error("Bedrock timeout"));

		const generator = new LlmFirstStrategyInputGenerator({
			llmGenerateFn: mockLlmFn,
			registry,
			mode: "llm",
			slideCount: 1,
		});

		const result = await generator.generate({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: ["kpi-card-overview"],
				warnings: [],
			},
		});

		expect(result.source).toBe("fallback");
		expect(result.warnings.some((w) => w.includes("Bedrock timeout"))).toBe(true);
	});

	it("strips forbidden keys from LLM output", async () => {
		const mockLlmFn = vi.fn<
			(req: LlmStrategyInputGenerationRequest) => Promise<LlmStrategyInputGenerationResult>
		>().mockResolvedValue({
			strategyInput: {
				headline: "Test",
				metrics: [
					{ label: "A", value: "100", fontSize: 14, x: 10 },
					{ label: "B", value: "200" },
					{ label: "C", value: "300" },
				],
			},
			source: "llm",
			warnings: [],
		});

		const generator = new LlmFirstStrategyInputGenerator({
			llmGenerateFn: mockLlmFn,
			registry,
			mode: "llm",
			slideCount: 1,
		});

		const result = await generator.generate({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: ["kpi-card-overview"],
				warnings: [],
			},
		});

		expect(result.source).toBe("llm");
		const metrics = (result.input as Record<string, unknown>).metrics as Array<
			Record<string, unknown>
		>;
		// Forbidden keys should be stripped
		expect(metrics[0]).not.toHaveProperty("fontSize");
		expect(metrics[0]).not.toHaveProperty("x");
		expect(result.warnings.some((w) => w.includes("Stripped forbidden keys"))).toBe(true);
	});

	it("uses deterministic mode when configured", async () => {
		const mockLlmFn = vi.fn();

		const generator = new LlmFirstStrategyInputGenerator({
			llmGenerateFn: mockLlmFn,
			registry,
			mode: "deterministic",
			slideCount: 1,
		});

		const result = await generator.generate({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: ["kpi-card-overview"],
				warnings: [],
			},
		});

		// Should NOT call the LLM function
		expect(mockLlmFn).not.toHaveBeenCalled();
		// Should produce a valid deterministic result
		expect(result.source).toBe("fallback");
		expect(result.strategyId).toBe("kpi-card-overview");
	});
});

describe("buildLlmStrategyInputSystemPrompt", () => {
	const registry = createBuiltinStrategyRegistry();
	const manifest = registry.getStrategyManifest("kpi-card-overview")!;

	it("builds a system prompt with strategy info", () => {
		const prompt = buildLlmStrategyInputSystemPrompt({
			slideIntent: makeResolvedIntent(),
			selection: {
				strategyId: "kpi-card-overview",
				confidence: "high",
				rationale: "test",
				selectedBy: "deterministicSelector",
				candidateIds: [],
				warnings: [],
			},
			manifest,
			inputJsonSchema: { type: "object" },
			slideIndex: 0,
			slideCount: 6,
			language: "ja",
			audience: "executive",
		});

		expect(prompt).toContain("kpi-card-overview");
		expect(prompt).toContain("slide 1 of 6");
		expect(prompt).toContain("FORBIDDEN keys");
		expect(prompt).toContain("Japanese");
		expect(prompt).toContain("executive-friendly");
	});
});

describe("buildLlmStrategyInputUserMessage", () => {
	it("includes key message and takeaway", () => {
		const msg = buildLlmStrategyInputUserMessage({
			slideIntent: makeResolvedIntent(),
		});

		expect(msg).toContain("Q2 KPI達成状況");
		expect(msg).toContain("全KPIが目標達成");
		expect(msg).toContain("report");
	});

	it("includes source content when provided", () => {
		const msg = buildLlmStrategyInputUserMessage({
			slideIntent: makeResolvedIntent(),
			sourceContent: { data: "production: 15200" },
		});

		expect(msg).toContain("production: 15200");
	});
});

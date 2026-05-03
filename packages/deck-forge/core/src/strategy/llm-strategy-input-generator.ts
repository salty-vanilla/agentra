/**
 * Phase 8J: LLM-based StrategyInput generator interface and utilities.
 *
 * The core module provides:
 * - Interface for LLM-based StrategyInput generation
 * - Prompt builder (reuses buildStrategyInputPrompt)
 * - Response validation and sanitization
 * - Forbidden-key stripping
 *
 * Runtime provides the actual Bedrock/OpenAI implementation.
 */

import type { AudienceType } from "#src/strategy/types.js";
import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategySelection } from "#src/strategy/strategy-selector.js";
import type { StrategyManifest } from "#src/strategy/manifest.js";
import type { StrategyRegistry } from "#src/strategy/registry.js";
import type {
	StrategyInputGenerationResult,
	StrategyInputGenerator,
} from "#src/strategy/strategy-input-generator.js";
import { DeterministicStrategyInputGenerator } from "#src/strategy/strategy-input-generator.js";
import {
	buildStrategyInputPrompt,
	validateLlmStrategyInputResponse,
} from "#src/strategy/strategy-input-prompt.js";
import { getStrategyInputJsonSchema } from "#src/strategy/strategy-input-json-schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmStrategyInputGenerationRequest {
	slideIntent: ResolvedSlideIntent;
	selection: StrategySelection;
	slideIndex: number;
	slideCount: number;
	manifest: StrategyManifest;
	inputJsonSchema: unknown;
	sourceContent?: unknown;
	language?: string;
	audience?: AudienceType;
}

export interface LlmStrategyInputGenerationResult {
	strategyInput: unknown;
	source: "llm" | "deterministic" | "fallback";
	warnings: string[];
	rawText?: string;
}

/**
 * Interface for an LLM-backed StrategyInput generation function.
 * Runtime provides the actual implementation (e.g., Bedrock).
 */
export interface LlmStrategyInputGenerateFn {
	(request: LlmStrategyInputGenerationRequest): Promise<LlmStrategyInputGenerationResult>;
}

// ---------------------------------------------------------------------------
// Forbidden keys that indicate layout/styling data leaked into StrategyInput
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = new Set([
	"x",
	"y",
	"width",
	"height",
	"fontSize",
	"fill",
	"stroke",
	"color",
	"shape",
	"position",
]);

/**
 * Recursively strips forbidden layout/styling keys from an object.
 * Returns a new object with those keys removed and a list of stripped keys.
 */
export function stripForbiddenKeys(
	obj: unknown,
): { cleaned: unknown; strippedKeys: string[] } {
	const strippedKeys: string[] = [];

	function walk(value: unknown): unknown {
		if (value === null || value === undefined) return value;
		if (Array.isArray(value)) return value.map(walk);
		if (typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				if (FORBIDDEN_KEYS.has(k)) {
					strippedKeys.push(k);
					continue;
				}
				result[k] = walk(v);
			}
			return result;
		}
		return value;
	}

	const cleaned = walk(obj);
	return { cleaned, strippedKeys };
}

// ---------------------------------------------------------------------------
// LLM-first StrategyInput generator with deterministic fallback
// ---------------------------------------------------------------------------

export interface LlmFirstStrategyInputGeneratorOptions {
	/** The LLM generation function (Bedrock/OpenAI/etc.). */
	llmGenerateFn: LlmStrategyInputGenerateFn;
	/** Strategy registry for manifest lookups. */
	registry: StrategyRegistry;
	/** Override: force a specific mode. */
	mode?: "llm" | "deterministic" | "fallback";
	/** Language hint for the LLM prompt. */
	language?: string;
	/** Total slide count in the deck (for prompt context). */
	slideCount?: number;
}

/**
 * StrategyInput generator that tries LLM first, falls back to deterministic.
 *
 * Source priority: llm > deterministic > fallback.
 */
export class LlmFirstStrategyInputGenerator implements StrategyInputGenerator {
	private readonly llmGenerateFn: LlmStrategyInputGenerateFn;
	private readonly registry: StrategyRegistry;
	private readonly deterministicFallback: DeterministicStrategyInputGenerator;
	private readonly mode: "llm" | "deterministic" | "fallback";
	private readonly language?: string;
	private slideCount: number;
	private slideIndex = 0;

	constructor(options: LlmFirstStrategyInputGeneratorOptions) {
		this.llmGenerateFn = options.llmGenerateFn;
		this.registry = options.registry;
		this.deterministicFallback = new DeterministicStrategyInputGenerator();
		this.mode = options.mode ?? "llm";
		this.language = options.language;
		this.slideCount = options.slideCount ?? 1;
	}

	/** Update slide count (useful when set after construction). */
	setSlideCount(count: number): void {
		this.slideCount = count;
	}

	async generate(input: {
		slideIntent: ResolvedSlideIntent;
		selection: StrategySelection;
		sourceContent?: unknown;
	}): Promise<StrategyInputGenerationResult> {
		const { slideIntent, selection, sourceContent } = input;
		const strategyId = selection.strategyId;
		const currentSlideIndex = this.slideIndex++;

		// Short-circuit: deterministic or fallback mode
		if (this.mode !== "llm") {
			return this.deterministicFallback.generate(input);
		}

		const manifest = this.registry.getStrategyManifest(strategyId);
		if (!manifest) {
			// No manifest → cannot build prompt → fallback
			const fallbackResult = this.deterministicFallback.generate(input);
			fallbackResult.warnings.push(
				`No manifest for strategy "${strategyId}"; using deterministic fallback.`,
			);
			return fallbackResult;
		}

		const inputJsonSchema = getStrategyInputJsonSchema(strategyId);

		try {
			const llmResult = await this.llmGenerateFn({
				slideIntent,
				selection,
				slideIndex: currentSlideIndex,
				slideCount: this.slideCount,
				manifest,
				inputJsonSchema: inputJsonSchema ?? {},
				sourceContent,
				language: this.language,
				audience: slideIntent.audience,
			});

			// Validate and sanitize the LLM output
			const sanitized = this.validateAndSanitize(
				strategyId,
				llmResult.strategyInput,
			);

			if (sanitized.ok) {
				return {
					strategyId,
					input: sanitized.input,
					source: "llm",
					warnings: [
						...llmResult.warnings,
						...sanitized.warnings,
					],
				};
			}

			// LLM output failed validation → fallback to deterministic
			const fallbackResult = this.deterministicFallback.generate(input);
			fallbackResult.warnings.push(
				`LLM StrategyInput for "${strategyId}" failed validation: ${sanitized.errors.join("; ")}; using deterministic fallback.`,
			);
			return fallbackResult;
		} catch (error) {
			// LLM call failed → fallback to deterministic
			const fallbackResult = this.deterministicFallback.generate(input);
			fallbackResult.warnings.push(
				`LLM StrategyInput generation failed for "${strategyId}": ${error instanceof Error ? error.message : String(error)}; using deterministic fallback.`,
			);
			return fallbackResult;
		}
	}

	private validateAndSanitize(
		strategyId: string,
		raw: unknown,
	): {
		ok: boolean;
		input?: unknown;
		errors: string[];
		warnings: string[];
	} {
		if (raw == null || typeof raw !== "object") {
			return {
				ok: false,
				errors: ["LLM returned null or non-object"],
				warnings: [],
			};
		}

		// Strip forbidden layout/styling keys
		const { cleaned, strippedKeys } = stripForbiddenKeys(raw);
		const warnings: string[] = [];
		if (strippedKeys.length > 0) {
			warnings.push(
				`Stripped forbidden keys from LLM StrategyInput: ${[...new Set(strippedKeys)].join(", ")}`,
			);
		}

		// Validate against schema
		const validation = validateLlmStrategyInputResponse({
			strategyId,
			response: cleaned,
		});

		if (validation.ok) {
			return {
				ok: true,
				input: validation.input ?? cleaned,
				errors: [],
				warnings: [...warnings, ...validation.warnings],
			};
		}

		return {
			ok: false,
			errors: validation.errors,
			warnings,
		};
	}
}

// ---------------------------------------------------------------------------
// System prompt builder for LLM StrategyInput generation
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt for LLM-based StrategyInput generation.
 * This is used by the runtime Bedrock implementation.
 */
export function buildLlmStrategyInputSystemPrompt(input: {
	slideIntent: ResolvedSlideIntent;
	selection: StrategySelection;
	manifest: StrategyManifest;
	inputJsonSchema: unknown;
	slideIndex: number;
	slideCount: number;
	sourceContent?: unknown;
	language?: string;
	audience?: AudienceType;
}): string {
	const { manifest, inputJsonSchema, slideIndex, slideCount, language, audience } = input;

	const langHint = language === "ja" || /[\u3000-\u9FFF]/.test(input.slideIntent.keyMessage)
		? "Use concise Japanese for all user-facing text."
		: "Use concise English for all user-facing text.";

	const audienceHint = audience === "executive"
		? "Use executive-friendly wording: short, decisive, action-oriented."
		: audience === "engineer"
			? "Use precise technical wording."
			: "";

	const forbiddenKeysStr = [...FORBIDDEN_KEYS].join(", ");

	return [
		"You are a presentation content strategist.",
		`Generate the semantic input JSON for the "${manifest.id}" strategy.`,
		"",
		"RULES:",
		"- Return ONLY valid JSON matching the provided inputJsonSchema.",
		"- Do NOT include coordinates, shapes, colors, font sizes, or PowerPoint rendering instructions.",
		`- FORBIDDEN keys (strip if present): ${forbiddenKeysStr}`,
		"- Do NOT invent meaningless placeholder metrics. Use concrete values from source content when available.",
		"- If source content is insufficient, create plausible but clearly business-like content from the slide intent.",
		"- Keep card labels short (≤20 chars for Japanese, ≤40 chars for English).",
		"- Keep table rows compact.",
		"- Avoid repeating the slide title inside cards/callouts.",
		"- Make each field semantically distinct.",
		langHint,
		audienceHint,
		"",
		`This is slide ${slideIndex + 1} of ${slideCount}.`,
		"",
		`Strategy: ${manifest.name} (${manifest.id})`,
		`Description: ${manifest.description}`,
		"",
		"inputJsonSchema:",
		JSON.stringify(inputJsonSchema, null, 2),
	].filter(Boolean).join("\n");
}

/**
 * Builds the user message for LLM-based StrategyInput generation.
 */
export function buildLlmStrategyInputUserMessage(input: {
	slideIntent: ResolvedSlideIntent;
	sourceContent?: unknown;
}): string {
	const { slideIntent, sourceContent } = input;

	const parts: string[] = [
		`Key message: ${slideIntent.keyMessage}`,
	];

	if (slideIntent.audienceTakeaway) {
		parts.push(`Audience takeaway: ${slideIntent.audienceTakeaway}`);
	}

	parts.push(`Communication intent: ${slideIntent.intent}`);
	parts.push(`Content kinds: ${slideIntent.contentKinds.join(", ")}`);

	if (sourceContent != null) {
		parts.push("");
		parts.push("Source content:");
		parts.push(typeof sourceContent === "string"
			? sourceContent
			: JSON.stringify(sourceContent, null, 2),
		);
	}

	parts.push("");
	parts.push("Generate the strategy input JSON now.");

	return parts.join("\n");
}

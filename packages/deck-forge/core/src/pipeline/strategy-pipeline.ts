/**
 * Phase 8H: Strategy Pipeline — orchestrates
 * DeckPlan → StrategySelection → StrategyInput → SlideSpec → IR.
 *
 * This is the canonical runtime pipeline. It does NOT depend on archetype
 * mapping or legacy contentBlocks as a primary path.
 */

import type { DeckPlan } from "#src/strategy/deck-plan.js";
import type {
	ResolvedSlideIntent,
	SlideIntent,
} from "#src/strategy/slide-intent.js";
import { resolveSlideIntent } from "#src/strategy/slide-intent.js";
import type {
	StrategySelection,
	StrategySelector,
} from "#src/strategy/strategy-selector.js";
import { selectStrategyForIntent } from "#src/strategy/select-strategy-for-intent.js";
import type {
	StrategyInputGenerationResult,
	StrategyInputGenerator,
} from "#src/strategy/strategy-input-generator.js";
import { DeterministicStrategyInputGenerator } from "#src/strategy/strategy-input-generator.js";
import type { StrategyRegistry } from "#src/strategy/registry.js";
import { createBuiltinStrategyRegistry } from "#src/strategy/index.js";
import { DeterministicStrategySelector } from "#src/strategy/deterministic-strategy-selector.js";
import type {
	PresentationBrief,
	SlideSpec,
} from "#src/schemas/intent-artifacts.js";
import type { PresentationIR } from "#src/index.js";
import type { TemplateProfile } from "#src/templates/template-profile.js";
import type { ThemeSpec } from "#src/index.js";
import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import type { DeckStrategyQualityReport } from "#src/diagnostics/strategy-quality-diagnostics.js";
import { analyzeDeckStrategyQuality } from "#src/diagnostics/strategy-quality-diagnostics.js";
import type {
	CommunicationIntent,
	ContentKind,
	DensityLevel,
} from "#src/strategy/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyPipelineInput {
	deckPlan: DeckPlan;

	/** Source content keyed by slide id. */
	sourceContentBySlideId?: Record<string, unknown>;
	/** Source content keyed by slide index. */
	sourceContentBySlideIndex?: Record<number, unknown>;

	/** Injection points — deterministic defaults used when omitted. */
	selector?: StrategySelector;
	strategyInputGenerator?: StrategyInputGenerator;
	registry?: StrategyRegistry;

	/** Quality diagnostics options. */
	qualityDiagnostics?: boolean;
	qualityGate?: boolean;

	/** Custom slide spec factory. */
	slideSpecFactory?: StrategySlideSpecFactory;
}

export interface StrategyPipelineSlideResult {
	slideIntent: ResolvedSlideIntent;
	selection: StrategySelection;
	strategyInputResult: StrategyInputGenerationResult;
	slideSpec: SlideSpec;
	warnings: string[];
}

export interface StrategyPipelineOutput {
	slideResults: StrategyPipelineSlideResult[];
	slideSpecs: SlideSpec[];
	warnings: string[];
}

export interface StrategySlideSpecFactoryInput {
	slideIntent: ResolvedSlideIntent;
	selection: StrategySelection;
	strategyInputResult: StrategyInputGenerationResult;
	slideIndex: number;
}

export type StrategySlideSpecFactory = (
	input: StrategySlideSpecFactoryInput,
) => SlideSpec;

// ---------------------------------------------------------------------------
// BuildIrFromDeckPlan types
// ---------------------------------------------------------------------------

export interface BuildIrFromDeckPlanInput
	extends Omit<StrategyPipelineInput, "qualityDiagnostics" | "qualityGate"> {
	brief?: PresentationBrief;
	templateProfile?: TemplateProfile;
	theme?: ThemeSpec;
	qualityDiagnostics?: boolean;
	qualityGate?: boolean;
}

export interface BuildIrFromDeckPlanOutput {
	presentation: PresentationIR;
	pipeline: StrategyPipelineOutput;
	quality?: DeckStrategyQualityReport;
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Quality gate error
// ---------------------------------------------------------------------------

export class StrategyQualityGateError extends Error {
	override name = "StrategyQualityGateError";
	constructor(public report: DeckStrategyQualityReport) {
		super(
			`Quality gate failed: score=${report.summary.score}, status=${report.summary.status}`,
		);
	}
}

// ---------------------------------------------------------------------------
// CommunicationIntent → SlideIntentSchema.type mapping
// ---------------------------------------------------------------------------

type SchemaSlideIntentType =
	| "title"
	| "agenda"
	| "summary"
	| "problem"
	| "comparison"
	| "timeline"
	| "process"
	| "architecture"
	| "data_insight"
	| "case_study"
	| "proposal"
	| "decision"
	| "closing";

const CONTENT_KIND_TO_INTENT_TYPE: Partial<
	Record<ContentKind, SchemaSlideIntentType>
> = {
	title: "title",
	section: "title",
	summary: "summary",
	comparison: "comparison",
	timeline: "timeline",
	process: "process",
	architecture: "architecture",
	decision: "decision",
	"action-plan": "proposal",
	"root-cause": "problem",
};

const COMMUNICATION_INTENT_TO_TYPE: Record<
	CommunicationIntent,
	SchemaSlideIntentType
> = {
	summarize: "summary",
	compare: "comparison",
	explain: "architecture",
	persuade: "proposal",
	decide: "decision",
	report: "data_insight",
	teach: "process",
	diagnose: "problem",
	plan: "agenda",
	review: "data_insight",
};

function inferSlideIntentType(
	intent: CommunicationIntent,
	contentKinds: ContentKind[],
): SchemaSlideIntentType {
	for (const kind of contentKinds) {
		const mapped = CONTENT_KIND_TO_INTENT_TYPE[kind];
		if (mapped) return mapped;
	}
	return COMMUNICATION_INTENT_TO_TYPE[intent];
}

// ---------------------------------------------------------------------------
// Layout type inference from strategy / content
// ---------------------------------------------------------------------------

type LayoutType =
	| "title"
	| "section"
	| "single_column"
	| "two_column"
	| "three_column"
	| "hero"
	| "image_left_text_right"
	| "text_left_image_right"
	| "comparison"
	| "dashboard"
	| "timeline"
	| "matrix"
	| "diagram_focus"
	| "custom";

const CONTENT_KIND_TO_LAYOUT: Partial<Record<ContentKind, LayoutType>> = {
	title: "title",
	section: "section",
	comparison: "comparison",
	timeline: "timeline",
	architecture: "diagram_focus",
	flow: "diagram_focus",
	kpi: "dashboard",
	chart: "single_column",
	table: "single_column",
};

function inferLayoutType(contentKinds: ContentKind[]): LayoutType {
	for (const kind of contentKinds) {
		const mapped = CONTENT_KIND_TO_LAYOUT[kind];
		if (mapped) return mapped;
	}
	return "single_column";
}

// ---------------------------------------------------------------------------
// Slide spec factory
// ---------------------------------------------------------------------------

export function createSlideSpecFromStrategyPipeline(
	input: StrategySlideSpecFactoryInput,
): SlideSpec {
	const { slideIntent, selection, strategyInputResult, slideIndex } = input;
	const si = strategyInputResult.input as Record<string, unknown>;

	const title =
		(si?.headline as string) ??
		(si?.message as string) ??
		(si?.keyMessage as string) ??
		slideIntent.keyMessage;

	const intentType = inferSlideIntentType(
		slideIntent.intent,
		slideIntent.contentKinds,
	);
	const layoutType = inferLayoutType(slideIntent.contentKinds);

	return {
		id: slideIntent.id ?? `slide-${slideIndex + 1}`,
		slideNumber: slideIndex + 1,
		title,
		intent: {
			type: intentType,
			keyMessage: slideIntent.keyMessage,
			audienceTakeaway: slideIntent.audienceTakeaway ?? "",
		},
		layout: {
			type: layoutType,
			density: slideIntent.density ?? ("medium" as DensityLevel),
		},
		// Native path: content comes from strategyInput, not contentBlocks.
		content: [],
		preferredStrategyId: selection.strategyId,
		strategyInput: strategyInputResult.input,
		strategyInputSource: strategyInputResult.source,
	} as SlideSpec;
}

// ---------------------------------------------------------------------------
// runStrategyPipeline
// ---------------------------------------------------------------------------

export async function runStrategyPipeline(
	input: StrategyPipelineInput,
): Promise<StrategyPipelineOutput> {
	const registry = input.registry ?? createBuiltinStrategyRegistry();
	const selector =
		input.selector ?? new DeterministicStrategySelector();
	const generator =
		input.strategyInputGenerator ??
		new DeterministicStrategyInputGenerator();
	const factory = input.slideSpecFactory ?? createSlideSpecFromStrategyPipeline;

	const { deckPlan } = input;
	const deckDefaults = {
		audience: deckPlan.audience,
		genre: deckPlan.genre,
		density: deckPlan.density,
	};

	const slideResults: StrategyPipelineSlideResult[] = [];
	const allWarnings: string[] = [];

	for (let i = 0; i < deckPlan.slides.length; i++) {
		const rawIntent = deckPlan.slides[i]!;
		const slideLabel = rawIntent.id
			? `[slide ${i + 1}: ${rawIntent.id}]`
			: `[slide ${i + 1}]`;
		const slideWarnings: string[] = [];

		// 1. Resolve intent with deck defaults
		const resolved = resolveSlideIntent(rawIntent, deckDefaults);

		// 2. Select strategy
		const selection = await selectStrategyForIntent(
			resolved,
			registry,
			selector,
		);
		for (const w of selection.warnings) {
			slideWarnings.push(`${slideLabel} selection: ${w}`);
		}

		// 3. Resolve source content (id wins over index)
		let sourceContent: unknown;
		if (rawIntent.id && input.sourceContentBySlideId?.[rawIntent.id] != null) {
			sourceContent = input.sourceContentBySlideId[rawIntent.id];
		} else if (input.sourceContentBySlideIndex?.[i] != null) {
			sourceContent = input.sourceContentBySlideIndex[i];
		}

		// 4. Generate strategy input
		const strategyInputResult = await generator.generate({
			slideIntent: resolved,
			selection,
			sourceContent,
		});
		for (const w of strategyInputResult.warnings) {
			slideWarnings.push(`${slideLabel} input: ${w}`);
		}

		// 5. Create slide spec
		const slideSpec = factory({
			slideIntent: resolved,
			selection,
			strategyInputResult,
			slideIndex: i,
		});

		slideResults.push({
			slideIntent: resolved,
			selection,
			strategyInputResult,
			slideSpec,
			warnings: slideWarnings,
		});
		allWarnings.push(...slideWarnings);
	}

	return {
		slideResults,
		slideSpecs: slideResults.map((r) => r.slideSpec),
		warnings: allWarnings,
	};
}

// ---------------------------------------------------------------------------
// buildPresentationIrFromDeckPlan
// ---------------------------------------------------------------------------

function createMinimalBrief(title: string): PresentationBrief {
	return {
		id: "auto",
		title,
		audience: {
			primary: "general",
			expertiseLevel: "intermediate",
		},
		goal: {
			type: "inform",
			mainMessage: "",
			desiredOutcome: "",
		},
		tone: {
			formality: "business",
			energy: "calm",
			technicalDepth: "medium",
		},
		narrative: {
			structure: "analysis",
			arc: [],
		},
		output: {
			formats: ["pptx"],
			aspectRatio: "16:9",
			language: "en",
		},
		constraints: {},
		visualDirection: {
			style: "corporate",
			mood: "trustworthy",
		},
	} as PresentationBrief;
}

export async function buildPresentationIrFromDeckPlan(
	input: BuildIrFromDeckPlanInput,
): Promise<BuildIrFromDeckPlanOutput> {
	// 1. Run strategy pipeline
	const pipelineOutput = await runStrategyPipeline(input);
	const allWarnings = [...pipelineOutput.warnings];

	// 2. Build IR
	const brief =
		input.brief ??
		createMinimalBrief(input.deckPlan.title ?? "Generated Presentation");

	const presentation = buildPresentationIr({
		brief,
		deckPlan: input.deckPlan,
		slideSpecs: pipelineOutput.slideSpecs,
		templateProfile: input.templateProfile,
		theme: input.theme,
	});

	// 3. Quality diagnostics (opt-in)
	let quality: DeckStrategyQualityReport | undefined;
	if (input.qualityDiagnostics || input.qualityGate) {
		quality = analyzeDeckStrategyQuality({ presentation });

		if (input.qualityGate && quality.summary.status === "fail") {
			throw new StrategyQualityGateError(quality);
		}
	}

	return {
		presentation,
		pipeline: pipelineOutput,
		quality,
		warnings: allWarnings,
	};
}

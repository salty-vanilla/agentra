/**
 * Phase 8I: Bridge from Zod ParsedDeckPlan to canonical strategy DeckPlan.
 *
 * Converts the LLM-generated ParsedDeckPlan (sections/SlidePlan) into the
 * canonical strategy DeckPlan (flat SlideIntent[]) for use with
 * runStrategyPipeline() and buildPresentationIrFromDeckPlan().
 *
 * Transitional parser bridge.
 * TODO(Phase 8J): remove after intent parser emits canonical DeckPlan directly.
 */

import type {
	ParsedDeckPlan,
	PresentationBrief,
	SlidePlan,
} from "#src/schemas/intent-artifacts.js";
import type { DeckPlan } from "#src/strategy/deck-plan.js";
import type { SlideIntent } from "#src/strategy/slide-intent.js";
import type {
	AudienceType,
	CommunicationIntent,
	ContentKind,
	DensityLevel,
	PresentationGenre,
} from "#src/strategy/types.js";

// ---------------------------------------------------------------------------
// SlideIntentSchema.type → CommunicationIntent mapping
// ---------------------------------------------------------------------------

type SlideIntentType =
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

const SLIDE_TYPE_TO_COMMUNICATION_INTENT: Record<
	SlideIntentType,
	CommunicationIntent
> = {
	title: "summarize",
	agenda: "plan",
	summary: "summarize",
	problem: "diagnose",
	comparison: "compare",
	timeline: "plan",
	process: "explain",
	architecture: "explain",
	data_insight: "report",
	case_study: "review",
	proposal: "persuade",
	decision: "decide",
	closing: "summarize",
};

// ---------------------------------------------------------------------------
// ContentRequirement.expectedBlockType → ContentKind mapping
// ---------------------------------------------------------------------------

type ExpectedBlockType =
	| "title"
	| "subtitle"
	| "paragraph"
	| "bullet_list"
	| "table"
	| "chart"
	| "diagram"
	| "image"
	| "metric"
	| "callout"
	| "code"
	| "quote";

const BLOCK_TYPE_TO_CONTENT_KIND: Partial<
	Record<ExpectedBlockType, ContentKind>
> = {
	title: "title",
	table: "table",
	chart: "chart",
	diagram: "architecture",
	metric: "kpi",
};

// ---------------------------------------------------------------------------
// Audience mapping
// ---------------------------------------------------------------------------

const BRIEF_AUDIENCE_TO_CANONICAL: Record<string, AudienceType> = {
	general: "general",
	executive: "executive",
	manager: "manager",
	engineer: "engineer",
	researcher: "researcher",
	operator: "operator",
	customer: "customer",
	// Common LLM outputs that aren't canonical
	technical: "engineer",
	business: "manager",
	leadership: "executive",
	stakeholder: "executive",
	// English synonyms
	executives: "executive",
	"senior management": "executive",
	management: "executive",
	board: "executive",
	director: "executive",
	cxo: "executive",
	ceo: "executive",
	cto: "executive",
	cfo: "executive",
	developer: "engineer",
	architect: "engineer",
	factory: "operator",
	manufacturing: "operator",
	operations: "operator",
	maintenance: "operator",
	// Japanese → executive
	経営層: "executive",
	役員: "executive",
	取締役: "executive",
	部長級: "executive",
	本部長: "executive",
	部長: "executive",
	// Japanese → engineer
	開発者: "engineer",
	技術者: "engineer",
	エンジニア: "engineer",
	設計者: "engineer",
	アーキテクト: "engineer",
	// Japanese → operator
	現場: "operator",
	製造現場: "operator",
	生産技術: "operator",
	保全: "operator",
	オペレーション: "operator",
	運用担当: "operator",
};

/**
 * Japanese audience patterns that appear inside longer strings.
 * Ordered from most specific to least specific so the first match wins.
 */
const AUDIENCE_SUBSTRING_PATTERNS: Array<{
	pattern: RegExp;
	audience: AudienceType;
}> = [
	// Executive / leadership patterns
	{ pattern: /経営層|取締役|役員|本部長|部長級|CxO|CEO|CTO|CFO/i, audience: "executive" },
	{ pattern: /senior\s+management|board|leadership|director/i, audience: "executive" },
	// Technical patterns
	{ pattern: /開発者|技術者|エンジニア|設計者|アーキテクト/i, audience: "engineer" },
	{ pattern: /developer|engineer|architect|technical/i, audience: "engineer" },
	// Operator / manufacturing patterns
	{ pattern: /製造現場|生産技術|保全|現場|オペレーション|運用担当/i, audience: "operator" },
	{ pattern: /factory|manufacturing|operations|maintenance/i, audience: "operator" },
	// Manager patterns
	{ pattern: /manager|management/i, audience: "manager" },
];

// ---------------------------------------------------------------------------
// Genre mapping
// ---------------------------------------------------------------------------

const BRIEF_GOAL_TYPE_TO_GENRE: Record<string, PresentationGenre> = {
	inform: "business-review",
	persuade: "sales-proposal",
	educate: "training",
	decide: "executive-summary",
	review: "business-review",
	propose: "sales-proposal",
	report: "data-analytics-report",
	analyze: "data-analytics-report",
};

// ---------------------------------------------------------------------------
// Conversion result
// ---------------------------------------------------------------------------

export interface ConvertToDeckPlanResult {
	deckPlan: DeckPlan;
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

export function convertParsedDeckPlanToCanonicalDeckPlan(input: {
	parsedDeckPlan: ParsedDeckPlan;
	brief: PresentationBrief;
}): ConvertToDeckPlanResult {
	const { parsedDeckPlan, brief } = input;
	const warnings: string[] = [];

	// Infer deck-level defaults from brief
	const audience = inferAudience(brief, warnings);
	const genre = inferGenre(brief, warnings);
	const density: DensityLevel = "medium";

	// Flatten sections → SlideIntent[]
	const slides: SlideIntent[] = [];
	for (const section of parsedDeckPlan.sections) {
		for (const slidePlan of section.slides) {
			const slideIntent = convertSlidePlan(slidePlan, warnings);
			slides.push(slideIntent);
		}
	}

	const deckPlan: DeckPlan = {
		id: parsedDeckPlan.id,
		title: parsedDeckPlan.title,
		objective: parsedDeckPlan.globalStoryline,
		audience,
		genre,
		density,
		slides,
	};

	return { deckPlan, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function convertSlidePlan(
	slidePlan: SlidePlan,
	warnings: string[],
): SlideIntent {
	const intentType = slidePlan.intent.type as SlideIntentType;
	const communicationIntent =
		SLIDE_TYPE_TO_COMMUNICATION_INTENT[intentType] ?? "explain";
	if (!SLIDE_TYPE_TO_COMMUNICATION_INTENT[intentType]) {
		warnings.push(
			`[${slidePlan.id}] Unknown intent type "${intentType}", defaulting to "explain"`,
		);
	}

	const contentKinds = inferContentKinds(slidePlan, intentType);

	return {
		id: slidePlan.id,
		keyMessage: slidePlan.intent.keyMessage,
		audienceTakeaway: slidePlan.intent.audienceTakeaway,
		intent: communicationIntent,
		contentKinds,
	};
}

function inferContentKinds(
	slidePlan: SlidePlan,
	intentType: SlideIntentType,
): ContentKind[] {
	const kinds = new Set<ContentKind>();

	// From content requirements
	for (const req of slidePlan.contentRequirements) {
		if (req.expectedBlockType) {
			const mapped =
				BLOCK_TYPE_TO_CONTENT_KIND[req.expectedBlockType as ExpectedBlockType];
			if (mapped) kinds.add(mapped);
		}
	}

	// From intent type (fallback)
	switch (intentType) {
		case "title":
			kinds.add("title");
			break;
		case "comparison":
			kinds.add("comparison");
			break;
		case "timeline":
			kinds.add("timeline");
			break;
		case "process":
			kinds.add("process");
			break;
		case "architecture":
			kinds.add("architecture");
			break;
		case "decision":
			kinds.add("decision");
			break;
		case "data_insight":
			kinds.add("kpi");
			break;
		case "summary":
			kinds.add("summary");
			break;
		case "problem":
			kinds.add("root-cause");
			break;
		case "proposal":
			kinds.add("action-plan");
			break;
		case "agenda":
			kinds.add("summary");
			break;
		case "closing":
			kinds.add("summary");
			break;
		case "case_study":
			kinds.add("summary");
			break;
	}

	// Ensure at least one kind
	if (kinds.size === 0) kinds.add("summary");

	return [...kinds];
}

function inferAudience(
	brief: PresentationBrief,
	warnings: string[],
): AudienceType {
	const primary = brief.audience?.primary;
	if (!primary) return "general";

	// 1. Exact match (case-insensitive)
	const mapped = BRIEF_AUDIENCE_TO_CANONICAL[primary.toLowerCase()];
	if (mapped) return mapped;

	// 2. Substring pattern match for composite labels like
	//    "経営層（取締役・役員・部長級）"
	for (const { pattern, audience } of AUDIENCE_SUBSTRING_PATTERNS) {
		if (pattern.test(primary)) return audience;
	}

	warnings.push(
		`Unknown audience "${primary}", defaulting to "general"`,
	);
	return "general";
}

function inferGenre(
	brief: PresentationBrief,
	warnings: string[],
): PresentationGenre {
	const goalType = (brief.goal as { type?: string })?.type;
	if (goalType) {
		const mapped = BRIEF_GOAL_TYPE_TO_GENRE[goalType.toLowerCase()];
		if (mapped) return mapped;
	}
	return "business-review";
}

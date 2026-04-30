import type { AssetSpec, DeckPlan, PresentationBrief, SlideSpec } from '@deck-forge/core';
import type { IntentParser, StructuredIntent, ValidationResult } from '@deck-forge/tools';
import {
  ASSET_SPEC_JSON_SCHEMA,
  BRIEF_JSON_SCHEMA,
  DECK_PLAN_JSON_SCHEMA,
  getBriefGenerationPrompt,
  getDeckPlanGenerationPrompt,
  getSlideSpecGenerationPrompt,
  SLIDE_SPEC_JSON_SCHEMA,
  validateBrief,
  validateDeckPlan,
  validateSlideSpec,
} from '@deck-forge/tools';
import {
  extractJson,
  invokeBedrockText,
  invokeBedrockToolUse,
} from './bedrock-client.js';
import { getLogger } from './logging.js';

/* ------------------------------------------------------------------ */
/*  Tool definitions wrapping v0.2.1 JSON Schemas                      */
/* ------------------------------------------------------------------ */

const BRIEF_TOOL = {
  name: 'create_brief',
  description:
    'Create a PresentationBrief that captures audience, goal, tone, narrative, and constraints.',
  input_schema: BRIEF_JSON_SCHEMA,
} as const;

const DECK_PLAN_TOOL = {
  name: 'create_deck_plan',
  description:
    'Create a DeckPlan that defines the section structure and slide plan for the presentation.',
  input_schema: DECK_PLAN_JSON_SCHEMA,
} as const;

const SLIDE_SPEC_TOOL = {
  name: 'create_slide_spec',
  description: 'Create a single SlideSpec for the requested slideId.',
  input_schema: SLIDE_SPEC_JSON_SCHEMA,
} as const;

/* ------------------------------------------------------------------ */
/*  Asset specs — keep custom schema/prompt (not yet provided by v0.2.1) */
/* ------------------------------------------------------------------ */

const ASSET_SPECS_SYSTEM = `You are a visual design consultant.
Given the PresentationBrief and SlideSpecs, create AssetSpecs for images and diagrams.
Use "retrieved_image" with specific searchQuery for photo content, "generated_image" with detailed prompts for illustrations.
Target each asset to specific slides via targetSlideIds.`;

const ASSET_SPECS_TOOL = {
  name: 'create_asset_specs',
  description:
    'Create the AssetSpec array describing images, diagrams, and icons needed for the presentation.',
  input_schema: {
    type: 'object',
    required: ['assetSpecs'],
    properties: {
      assetSpecs: {
        type: 'array',
        items: ASSET_SPEC_JSON_SCHEMA,
      },
    },
  },
} as const;

const MODIFY_SYSTEM = `You are a presentation consultant AI. Given a user request and an inspect summary of the current presentation, produce a structured intent for modifying the presentation.

Return JSON:
{
  "mode": "modify",
  "confidence": <number 0-1>,
  "missingFields": [],
  "goal": "<user goal>",
  "modifyIntent": {
    "changeRequest": "<description>",
    "operations": []
  }
}

Return ONLY the JSON, wrapped in a code fence.`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function log(step: string, msg: string, data?: unknown) {
  if (data !== undefined) {
    getLogger().info({ step, data }, `[deck-forge-runtime] [${step}] ${msg}`);
  } else {
    getLogger().info({ step }, `[deck-forge-runtime] [${step}] ${msg}`);
  }
}

function detectLanguage(text: string): 'ja' | 'en' {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)
    ? 'ja'
    : 'en';
}

/**
 * Run an LLM step that returns a tool_use payload, validate the result,
 * and retry once with the validation issues injected into the prompt.
 */
async function generateAndValidate<T>(input: {
  step: string;
  system: string;
  userMessage: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  validate: (value: unknown) => ValidationResult;
  maxTokens?: number;
}): Promise<T> {
  const first = await invokeBedrockToolUse<T>({
    system: input.system,
    userMessage: input.userMessage,
    tool: input.tool,
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  });

  const firstResult = input.validate(first);
  if (firstResult.valid) {
    return first;
  }

  log(input.step, 'validation failed, retrying once', { issues: firstResult.issues });

  const retryMessage = `${input.userMessage}

The previous attempt failed validation with these issues:
${firstResult.issues.map((i) => `- ${i}`).join('\n')}

Fix every issue and call the tool again with a corrected payload.`;

  const second = await invokeBedrockToolUse<T>({
    system: input.system,
    userMessage: retryMessage,
    tool: input.tool,
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  });

  const secondResult = input.validate(second);
  if (!secondResult.valid) {
    log(input.step, 'validation failed after retry', { issues: secondResult.issues });
    throw new Error(
      `[${input.step}] validation failed after retry: ${secondResult.issues.join('; ')}`,
    );
  }
  return second;
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

/**
 * The intermediate artifacts produced by the create pipeline. We expose
 * these so callers can re-build a StructuredIntent after revising
 * SlideSpecs (vision-reviewer revision loop).
 */
export type CreatePipelineResult = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs: AssetSpec[];
  intent: StructuredIntent;
};

/**
 * Run the full create pipeline (brief -> deckPlan -> slideSpecs -> assetSpecs)
 * once and return both the StructuredIntent (ready to feed into the runner)
 * and the intermediate artifacts (so they can be revised and rebuilt).
 */
export async function runCreatePipeline(
  userRequest: string,
): Promise<CreatePipelineResult> {
  const language = detectLanguage(userRequest);

  // Step 1: Brief
  log('brief', 'invoking tool_use...');
  const brief = await generateAndValidate<PresentationBrief>({
    step: 'brief',
    system: getBriefGenerationPrompt({ goal: userRequest, language }),
    userMessage: userRequest,
    tool: BRIEF_TOOL,
    validate: (v) => validateBrief(v, { expectedLanguage: language }),
  });
  log('brief', 'done', {
    id: brief.id,
    title: brief.title,
    language: brief.output?.language,
  });

  // Step 2: DeckPlan
  log('deckPlan', 'invoking tool_use...');
  const expectedSlideCount = brief.constraints?.slideCount;
  const deckPlanOptions = expectedSlideCount !== undefined ? { expectedSlideCount } : {};
  const deckPlan = await generateAndValidate<DeckPlan>({
    step: 'deckPlan',
    system: getDeckPlanGenerationPrompt({ brief }),
    userMessage: `PresentationBrief:\n${JSON.stringify(brief, null, 2)}`,
    tool: DECK_PLAN_TOOL,
    validate: (v) => validateDeckPlan(v, deckPlanOptions),
  });
  log('deckPlan', 'done', {
    id: deckPlan.id,
    sections: deckPlan.sections?.length,
    slides: deckPlan.sections?.reduce((n, s) => n + (s.slides?.length ?? 0), 0),
  });

  // Step 3: SlideSpecs — generate each slide in parallel
  const slideIds = deckPlan.sections.flatMap((section) =>
    section.slides.map((slide) => slide.id),
  );
  log('slideSpecs', 'invoking tool_use in parallel', { count: slideIds.length });

  // NOTE: We intentionally do NOT forward brief.constraints.mustInclude /
  // mustAvoid to validateSlideSpec. The brief LLM tends to populate mustInclude
  // with verbatim formatted strings (e.g. "天気：晴れ（Sunny）") that will
  // never match the structured SlideSpec JSON, causing permanent validation
  // failures. The constraints are already present in the system prompt via
  // getSlideSpecGenerationPrompt({ brief }), so the LLM is guided to include
  // the required content without us needing to enforce it at the schema level.
  // Hint to the LLM that 0.3.0 renderers natively support these block types
  // and decoration tokens, so it should prefer them over plain paragraph
  // walls of text. Appended to the upstream system prompt rather than
  // editing the prompt source.
  const slideSpecExtraGuidance = `

============================================================
ADDITIONAL DRAFTING RULES (deck-forge 0.3.0 renderer + house style)
============================================================

Renderer capabilities — prefer these block types over plain paragraphs:
- MetricBlock → rendered as a card-decorated callout with KPI grid auto-layout. Use it for ALL numeric KPIs.
- DiagramBlock kinds:
    cycle      → 3–6 nodes that loop back. Use for repeating processes.
    flowchart  → 3–8 sequential steps. Use for procedures / pipelines / "before → after" flows.
    timeline   → time-ordered milestones. Use for schedules, roadmaps, history.
    funnel     → top-down narrowing. Use for conversion / filtering.
    layered    → vertical stack of layers. Use for architectures.
    matrix     → 2×2 / 3×3 grid. Use for categorisations.
- ChartBlock (bar / line / area / pie / scatter) → rendered as native pptx chart. Use for trends and comparisons.
- TableBlock → use for ≥2-column comparisons.
- BulletListBlock → semantic <ul><li> with nested indent levels. Use for lists, NOT for processes (use Diagram).

House style — the difference between "auto-generated" and "consultant-quality":

1. Title rules
   - ≤25 characters when possible. Punchy, statement-style, NOT a question.
   - 体言止め (noun-ending) preferred for ja; sentence case for en.
   - The cover slide title MUST include the subject; the subtitle MUST include 対象期間 + 作成日 (when ja).

2. KPI rules
   - Every KPI is its own MetricBlock with: label, value (number), unit, optional delta vs prior period.
   - Format value as "92" + unit "%" — never embed unit in value.
   - When a delta is provided, use ↑ / ↓ glyphs and absolute pp/% (e.g. "+2.1pt", "−0.3%").
   - 1 slide should hold 3–6 KPIs max. If more, split into two slides.

3. Body text rules
   - 1 slide = 1 message. The title states the message; the body proves it.
   - Bullet lines: max 5 per block, max 30 chars each (ja) / 60 chars (en). No nested bullets unless the structure is genuinely hierarchical.
   - Never write a paragraph longer than 80 chars (ja) / 160 chars (en) — split or convert to bullets.
   - Do NOT mix 敬体 (です・ます) and 常体 (だ・である) in the same deck. Pick one and stick to it. Default: 常体 + 体言止め for executive decks.

4. Structure rules
   - Process / steps → flowchart Diagram, NOT bulleted list.
   - Trend over time → Chart (line/area), NOT a table.
   - Comparison across categories → Table or kpi-grid layout, NOT bullets.
   - Narrative summary → CalloutBlock above body, NOT paragraph at top.

5. Speaker notes
   - Add concise speakerNotes to every slide. 2–4 sentences explaining what the presenter should say to expand on the visible content. Audience-appropriate.

6. Anti-patterns to AVOID:
   ✗ Long paragraph blocks ("製造ラインの稼働率は今四半期において…")
   ✗ Bulleted lists of single-word items (use a Table or shape diagram instead)
   ✗ Repeating the slide title in the body
   ✗ Numbers without units, units without numbers
   ✗ "図1" / "Figure 1" style captions — let the layout speak

GOOD example (KPI slide body block):
  { type: "metric", label: "稼働率", value: 92, unit: "%", delta: { value: 2.1, direction: "up", unit: "pt" } }
BAD example (same intent):
  { type: "paragraph", text: "稼働率は92%で、前期比+2.1ポイントの改善となりました。" }

Apply these rules silently — do not mention them in the output content.`;

  const rawSlideSpecs = await Promise.all(
    slideIds.map((slideId) =>
      generateAndValidate<SlideSpec>({
        step: `slideSpec[${slideId}]`,
        system: `${getSlideSpecGenerationPrompt({ brief, deckPlan, slideId })}${slideSpecExtraGuidance}`,
        userMessage: `Brief:\n${JSON.stringify(brief, null, 2)}\n\nDeckPlan:\n${JSON.stringify(deckPlan, null, 2)}\n\nGenerate the SlideSpec for slideId="${slideId}".`,
        tool: SLIDE_SPEC_TOOL,
        validate: (v) => validateSlideSpec(v),
      }),
    ),
  );
  const slideSpecs = rawSlideSpecs;
  log('slideSpecs', 'done', { count: slideSpecs.length });

  // Step 4: AssetSpecs (optional — skip if no visual needs)
  let assetSpecs: AssetSpec[] = [];
  const hasVisualNeeds = deckPlan.sections?.some((s) =>
    s.slides?.some((sl) => sl.assetRequirements && sl.assetRequirements.length > 0),
  );
  if (hasVisualNeeds) {
    log('assetSpecs', 'invoking tool_use...');
    const result = await invokeBedrockToolUse<{ assetSpecs: AssetSpec[] }>({
      system: ASSET_SPECS_SYSTEM,
      userMessage: `User request: ${userRequest}\n\nPresentationBrief:\n${JSON.stringify(brief, null, 2)}\n\nSlideSpecs:\n${JSON.stringify(slideSpecs, null, 2)}`,
      tool: ASSET_SPECS_TOOL,
    });
    assetSpecs = result.assetSpecs ?? [];
    log('assetSpecs', 'done', { count: assetSpecs.length });
  } else {
    log('assetSpecs', 'skipped (no asset requirements in deckPlan)');
  }

  const intent = buildStructuredIntent({
    brief,
    deckPlan,
    slideSpecs,
    assetSpecs,
    userRequest,
    language,
  });

  return { brief, deckPlan, slideSpecs, assetSpecs, intent };
}

/**
 * Assemble a StructuredIntent from already-generated artifacts. Used both
 * by the initial pipeline and by the vision-revision loop after slideSpecs
 * have been rewritten by the reviewer.
 */
export function buildStructuredIntent(input: {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs: AssetSpec[];
  userRequest: string;
  language: 'ja' | 'en';
}): StructuredIntent {
  const { brief, deckPlan, slideSpecs, assetSpecs, userRequest, language } = input;
  return {
    mode: 'create',
    confidence: 0.95,
    goal: brief.goal?.mainMessage ?? userRequest,
    audience: brief.audience?.primary,
    slideCount: deckPlan.slideCountTarget,
    grounding: {
      language: brief.output?.language ?? language,
      requestedSlideCount: brief.constraints?.slideCount ?? deckPlan.slideCountTarget,
    },
    createArtifacts: {
      brief,
      deckPlan,
      slideSpecs,
      assetSpecs,
    },
  };
}

/**
 * Build an IntentParser that returns a pre-computed StructuredIntent
 * instead of calling Bedrock. Used to plug pre-pipeline-run results into
 * the DeckForgeRunner and to re-run after vision-revision without redoing
 * brief/deckPlan/slideSpec generation.
 */
export function createStaticIntentParser(intent: StructuredIntent): IntentParser {
  return {
    async parseCreate(): Promise<StructuredIntent> {
      return intent;
    },
    async parseModify(): Promise<StructuredIntent> {
      throw new Error(
        'createStaticIntentParser does not support parseModify. Use createBedrockIntentParser instead.',
      );
    },
  };
}

export function createBedrockIntentParser(): IntentParser {
  return {
    async parseCreate({ userRequest }): Promise<StructuredIntent> {
      const result = await runCreatePipeline(userRequest);
      return result.intent;
    },

    async parseModify({ userRequest, inspectSummary }): Promise<StructuredIntent> {
      const message = inspectSummary
        ? `Request: ${userRequest}\n\nCurrent presentation:\n${JSON.stringify(inspectSummary, null, 2)}`
        : userRequest;

      const response = await invokeBedrockText({
        system: MODIFY_SYSTEM,
        userMessage: message,
      });

      const intent = extractJson<StructuredIntent>(response);

      return {
        ...intent,
        mode: 'modify',
      };
    },
  };
}

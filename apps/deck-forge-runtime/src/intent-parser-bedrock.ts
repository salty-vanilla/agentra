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
  console.info(
    `[deck-forge-runtime] [${step}]`,
    msg,
    data !== undefined ? JSON.stringify(data) : '',
  );
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

export function createBedrockIntentParser(): IntentParser {
  return {
    async parseCreate({ userRequest }): Promise<StructuredIntent> {
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
      const deckPlanOptions =
        expectedSlideCount !== undefined ? { expectedSlideCount } : {};
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

      const slideSpecs = await Promise.all(
        slideIds.map((slideId) =>
          generateAndValidate<SlideSpec>({
            step: `slideSpec[${slideId}]`,
            system: getSlideSpecGenerationPrompt({ brief, deckPlan, slideId }),
            userMessage: `Brief:\n${JSON.stringify(brief, null, 2)}\n\nDeckPlan:\n${JSON.stringify(deckPlan, null, 2)}\n\nGenerate the SlideSpec for slideId="${slideId}".`,
            tool: SLIDE_SPEC_TOOL,
            validate: (v) => validateSlideSpec(v),
          }),
        ),
      );
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

      const intent: StructuredIntent = {
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

      return intent;
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

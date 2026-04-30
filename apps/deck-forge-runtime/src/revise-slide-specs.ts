import type { PresentationBrief, SlideSpec } from '@deck-forge/core';
import { SLIDE_SPEC_JSON_SCHEMA, validateSlideSpec } from '@deck-forge/tools';
import { invokeBedrockToolUse } from './bedrock-client.js';
import { getLogger } from './logging.js';
import type { SlideVisionReview } from './vision-reviewer.js';

const SLIDE_SPEC_TOOL = {
  name: 'create_slide_spec',
  description: 'Create a single revised SlideSpec for the requested slideId.',
  input_schema: SLIDE_SPEC_JSON_SCHEMA,
} as const;

const SYSTEM_PROMPT = `You are revising a single SlideSpec for a presentation slide that received negative visual review feedback.

You receive:
1. The PresentationBrief (audience, goal, language, must-include / must-avoid).
2. The CURRENT SlideSpec that produced a problematic rendered slide.
3. A list of visual issues found by a vision reviewer who actually looked at the rendered PNG.

Produce a revised SlideSpec that addresses every issue. Constraints:
- Keep the same slideId, intent.kind, and overall narrative role.
- Prefer SHORTER, more focused content over longer text. Most overlap/truncation problems come from too much text.
- Split dense content blocks into multiple smaller blocks (callout + bullet rather than one giant paragraph).
- If the issue mentions overlap/truncation, reduce the number of content blocks or shorten labels.
- If the issue mentions readability/contrast, simplify wording (visual styling is theme-driven, not block-level).
- Keep the brief's language. Honor mustInclude/mustAvoid.
- Use the create_slide_spec tool.`;

export type ReviseSlideSpecsInput = {
  slideSpecs: SlideSpec[];
  review: { slides: SlideVisionReview[] };
  brief: PresentationBrief;
};

/**
 * Revise only the slideSpecs flagged by the vision reviewer.
 * Returns the full slideSpecs array with revised entries swapped in.
 * Slides that pass the review (or whose revision fails) are kept as-is.
 */
export async function reviseSlideSpecs(
  input: ReviseSlideSpecsInput,
): Promise<{ slideSpecs: SlideSpec[]; revisedCount: number }> {
  const log = getLogger();
  const startedAt = Date.now();

  const reviewBySlideId = new Map<string, SlideVisionReview>();
  for (const slide of input.review.slides) {
    reviewBySlideId.set(slide.slideId, slide);
  }

  const mustInclude = input.brief.constraints?.mustInclude;
  const mustAvoid = input.brief.constraints?.mustAvoid;
  const validatorOptions: Parameters<typeof validateSlideSpec>[1] = {
    ...(mustInclude && mustInclude.length > 0 ? { mustInclude } : {}),
    ...(mustAvoid && mustAvoid.length > 0 ? { mustAvoid } : {}),
  };

  let revisedCount = 0;

  const revisedSpecs = await Promise.all(
    input.slideSpecs.map(async (spec): Promise<SlideSpec> => {
      const review = reviewBySlideId.get(spec.id);
      if (!review?.needsRevision || review.issues.length === 0) {
        return spec;
      }

      try {
        const userMessage = [
          `PresentationBrief:`,
          JSON.stringify(input.brief, null, 2),
          '',
          `Current SlideSpec (slideId="${spec.id}"):`,
          JSON.stringify(spec, null, 2),
          '',
          `Vision review of the rendered slide (score=${review.overallScore}/10):`,
          `Summary: ${review.summary}`,
          'Issues:',
          ...review.issues.map(
            (issue, i) =>
              `${i + 1}. [${issue.severity}/${issue.category}] ${issue.description}\n   Suggested fix: ${issue.suggestion}`,
          ),
          '',
          'Produce a revised SlideSpec that resolves every issue. Keep the same slideId.',
        ].join('\n');

        const revised = await invokeBedrockToolUse<SlideSpec>({
          system: SYSTEM_PROMPT,
          userMessage,
          tool: SLIDE_SPEC_TOOL,
          maxTokens: 8192,
        });

        // Force the slideId to match (defensive — the LLM is told to keep it but may slip).
        const withCorrectId: SlideSpec = { ...revised, id: spec.id };

        const validation = validateSlideSpec(withCorrectId, validatorOptions);
        if (!validation.valid) {
          log.warn(
            { slideId: spec.id, issues: validation.issues },
            '[deck-forge-runtime] [revise-slide-specs] revised spec failed validation; keeping original',
          );
          return spec;
        }

        revisedCount += 1;
        log.info(
          {
            slideId: spec.id,
            score: review.overallScore,
            issueCount: review.issues.length,
          },
          '[deck-forge-runtime] [revise-slide-specs] slide revised',
        );
        return withCorrectId;
      } catch (error) {
        log.warn(
          {
            slideId: spec.id,
            error: error instanceof Error ? error.message : String(error),
          },
          '[deck-forge-runtime] [revise-slide-specs] revision failed; keeping original',
        );
        return spec;
      }
    }),
  );

  log.info(
    {
      totalSlides: input.slideSpecs.length,
      revisedCount,
      durationMs: Date.now() - startedAt,
    },
    '[deck-forge-runtime] [revise-slide-specs] done',
  );

  return { slideSpecs: revisedSpecs, revisedCount };
}

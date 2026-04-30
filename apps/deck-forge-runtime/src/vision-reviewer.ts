import type { PresentationBrief, SlideSpec } from '@deck-forge/core';
import { invokeBedrockVisionToolUse } from './bedrock-client.js';
import { getLogger } from './logging.js';
import type { RenderedSlide } from './pptx-renderer.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type VisionIssueSeverity = 'info' | 'warning' | 'error';

export type VisionIssueCategory =
  | 'overlap'
  | 'truncation'
  | 'readability'
  | 'contrast'
  | 'alignment'
  | 'whitespace'
  | 'visual_hierarchy'
  | 'content_mismatch'
  | 'other';

export type VisionIssue = {
  category: VisionIssueCategory;
  severity: VisionIssueSeverity;
  description: string;
  suggestion: string;
};

export type SlideVisionReview = {
  slideId: string;
  slideIndex: number;
  overallScore: number; // 0-10
  needsRevision: boolean;
  summary: string;
  issues: VisionIssue[];
};

export type VisionReviewReport = {
  generatedAt: string;
  model: string;
  slideCount: number;
  averageScore: number;
  slidesNeedingRevision: number;
  slides: SlideVisionReview[];
};

/* ------------------------------------------------------------------ */
/*  Tool schema                                                        */
/* ------------------------------------------------------------------ */

const REVIEW_TOOL = {
  name: 'submit_slide_review',
  description: 'Submit a structured visual quality review for a single rendered slide.',
  input_schema: {
    type: 'object',
    required: ['overallScore', 'needsRevision', 'summary', 'issues'],
    properties: {
      overallScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description:
          'Overall visual quality score (0=unusable, 5=acceptable, 10=publication ready).',
      },
      needsRevision: {
        type: 'boolean',
        description:
          'True if the slide has at least one warning- or error-level issue that should be fixed before publishing.',
      },
      summary: {
        type: 'string',
        description: 'One- or two-sentence overall impression of the slide.',
      },
      issues: {
        type: 'array',
        description:
          'Concrete visual problems observed in the rendered image. Empty array means the slide looks clean.',
        items: {
          type: 'object',
          required: ['category', 'severity', 'description', 'suggestion'],
          properties: {
            category: {
              type: 'string',
              enum: [
                'overlap',
                'truncation',
                'readability',
                'contrast',
                'alignment',
                'whitespace',
                'visual_hierarchy',
                'content_mismatch',
                'other',
              ],
            },
            severity: { type: 'string', enum: ['info', 'warning', 'error'] },
            description: {
              type: 'string',
              description:
                'What is wrong, described in terms of what is visible in the image (e.g. "the title overlaps with the metric callout in the upper-left quadrant").',
            },
            suggestion: {
              type: 'string',
              description:
                'Concrete actionable fix the SlideSpec author can apply (e.g. "shorten the title to under 30 characters" or "split the callout into two separate blocks").',
            },
          },
        },
      },
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/*  System prompt                                                      */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a senior presentation designer reviewing a single rendered PowerPoint slide.

You receive:
1. A PNG image of the rendered slide (the source of truth for visual quality).
2. The SlideSpec JSON that was used to generate the slide (for reference only).
3. The PresentationBrief context (audience, goal, language).

Your job is to critique the slide as a human reviewer would. Look for:
- **overlap**: text/elements visually overlapping or stacked
- **truncation**: text cut off at the slide edge or inside its container
- **readability**: text too small / too dense / too long for one slide
- **contrast**: text vs background contrast too low to read
- **alignment**: misaligned columns, awkward indentation, broken grid
- **whitespace**: excessive empty space OR cramped layout with no margins
- **visual_hierarchy**: unclear what to read first; titles indistinct
- **content_mismatch**: rendered content does not match the SlideSpec intent (missing data, wrong language)

Be specific and reference what you actually see in the image. Do NOT invent issues that are not visible.
If the slide looks clean and professional, return an empty issues array, needsRevision=false, and a high score.

Respond by calling the submit_slide_review tool. Use the brief's language for description/suggestion fields.`;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export type ReviewSlidesInput = {
  slides: RenderedSlide[];
  slideSpecs: SlideSpec[];
  brief: PresentationBrief;
};

/**
 * Run vision review on every rendered slide in parallel.
 * The slideSpecs are matched to slides positionally (index 0 -> first PNG).
 */
export async function reviewSlidesWithVision(
  input: ReviewSlidesInput,
): Promise<VisionReviewReport> {
  const log = getLogger();
  const startedAt = Date.now();
  const language = input.brief.output?.language ?? 'en';
  const model =
    process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID?.trim() ||
    'global.anthropic.claude-sonnet-4-6';

  log.info(
    { slideCount: input.slides.length, language, model },
    '[deck-forge-runtime] [vision-reviewer] starting',
  );

  const results = await Promise.all(
    input.slides.map(async (rendered, idx): Promise<SlideVisionReview> => {
      const spec = input.slideSpecs[idx];
      const slideId = spec?.id ?? `slide-${idx + 1}`;

      try {
        const userText = [
          `PresentationBrief context (language=${language}, audience=${input.brief.audience?.primary ?? 'general'}):`,
          JSON.stringify(
            {
              title: input.brief.title,
              goal: input.brief.goal,
              tone: input.brief.tone,
              visualDirection: input.brief.visualDirection,
            },
            null,
            2,
          ),
          '',
          `SlideSpec for the rendered image (slideId="${slideId}"):`,
          JSON.stringify(spec ?? null, null, 2),
          '',
          'Review the rendered slide image above against this context and submit your findings via the tool.',
        ].join('\n');

        const review = await invokeBedrockVisionToolUse<{
          overallScore: number;
          needsRevision: boolean;
          summary: string;
          issues: VisionIssue[];
        }>({
          system: SYSTEM_PROMPT,
          text: userText,
          images: [{ base64: rendered.png.toString('base64'), mediaType: 'image/png' }],
          tool: REVIEW_TOOL,
          maxTokens: 2048,
        });

        return {
          slideId,
          slideIndex: idx,
          overallScore: review.overallScore,
          needsRevision: review.needsRevision,
          summary: review.summary,
          issues: review.issues ?? [],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(
          { slideId, slideIndex: idx, error: message },
          '[deck-forge-runtime] [vision-reviewer] slide review failed; treating as clean',
        );
        return {
          slideId,
          slideIndex: idx,
          overallScore: 5,
          needsRevision: false,
          summary: `Vision review failed: ${message}`,
          issues: [],
        };
      }
    }),
  );

  const slidesNeedingRevision = results.filter((r) => r.needsRevision).length;
  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
      : 0;

  const report: VisionReviewReport = {
    generatedAt: new Date().toISOString(),
    model,
    slideCount: results.length,
    averageScore,
    slidesNeedingRevision,
    slides: results,
  };

  log.info(
    {
      slideCount: report.slideCount,
      averageScore: report.averageScore,
      slidesNeedingRevision: report.slidesNeedingRevision,
      durationMs: Date.now() - startedAt,
    },
    '[deck-forge-runtime] [vision-reviewer] done',
  );

  return report;
}

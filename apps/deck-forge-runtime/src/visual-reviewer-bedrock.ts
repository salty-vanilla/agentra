import type {
  PresentationOperation,
  SlideImage,
  VisualReviewer,
  VisualReviewerInput,
  VisualReviewerOutput,
  VisualReviewFinding,
  VisualReviewSeverity,
} from '@deck-forge/core';
import { invokeBedrockVisionToolUse, type VisionImage } from './bedrock-client.js';
import { getLogger } from './logging.js';

/* ------------------------------------------------------------------ */
/*  Tool schema                                                        */
/* ------------------------------------------------------------------ */

/**
 * Per-slide tool: the reviewer is invoked once per rendered slide image so
 * each call has a single concrete image attached. Operations are applied
 * verbatim by `runDesignReviewLoop`.
 */
const REVIEW_TOOL = {
  name: 'submit_visual_review',
  description:
    'Submit findings + corrective operations for a single rendered slide image.',
  input_schema: {
    type: 'object',
    required: ['findings', 'operations'],
    properties: {
      findings: {
        type: 'array',
        description:
          'Visible issues in the rendered slide. Empty array = the slide looks clean.',
        items: {
          type: 'object',
          required: ['severity', 'category', 'message'],
          properties: {
            severity: { type: 'string', enum: ['info', 'warning', 'error'] },
            category: {
              type: 'string',
              description:
                'Free-form tag, e.g. overlap, low-contrast, truncation, hierarchy, whitespace, alignment.',
            },
            message: {
              type: 'string',
              description:
                'What is visibly wrong in the rendered image, described as a human reviewer would.',
            },
            elementId: {
              type: 'string',
              description: 'Optional element this finding pertains to.',
            },
          },
        },
      },
      operations: {
        type: 'array',
        description:
          'Operations that fix the findings. Empty array = report-only (loop will stop). Use real elementIds from the SlideIR.',
        items: {
          type: 'object',
          oneOf: [
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId', 'text'],
              properties: {
                type: { const: 'update_text' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
                text: { type: 'string' },
                style: { type: 'object' },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId'],
              properties: {
                type: { const: 'delete_element' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'layout'],
              properties: {
                type: { const: 'set_slide_layout' },
                slideId: { type: 'string' },
                layout: { type: 'object' },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId', 'frame'],
              properties: {
                type: { const: 'set_element_frame' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
                frame: {
                  type: 'object',
                  required: ['x', 'y', 'width', 'height'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                  },
                },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId', 'x', 'y'],
              properties: {
                type: { const: 'move_element' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
                x: { type: 'number', description: 'New x position in px.' },
                y: { type: 'number', description: 'New y position in px.' },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId', 'width', 'height'],
              properties: {
                type: { const: 'resize_element' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
                width: { type: 'number', description: 'New width in px.' },
                height: { type: 'number', description: 'New height in px.' },
              },
            },
          ],
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are a senior presentation designer reviewing a single rendered slide.

You receive:
1. A PNG image of the rendered slide (the source of truth).
2. The SlideIR JSON for that slide (use it to look up elementIds for operations).
3. The presentation's brief / theme summary for context.

Look for visible problems: overlap, truncation, low contrast, unclear hierarchy, cramped or wasted whitespace, misalignment.

Then propose CORRECTIVE operations (update_text / delete_element / set_slide_layout / set_element_frame / move_element / resize_element) that fix what you observed. Hard rules:
- Operations must reference REAL slideId / elementId values from the SlideIR. Never invent IDs.
- Prefer SHORTER text. Most overlap/truncation comes from too much text.
- Use set_element_frame / move_element / resize_element to fix overlap, misalignment, or wasted whitespace by repositioning elements precisely.
- Keep the slide's language. Do not change narrative meaning.
- Aim for 0-3 operations per slide. Return [] if the slide is already clean.
- Do not propose color/style changes unless contrast is visibly broken.

Call submit_visual_review exactly once.`;

/* ------------------------------------------------------------------ */
/*  Reviewer impl                                                      */
/* ------------------------------------------------------------------ */

type ReviewToolOutput = {
  findings: Array<{
    severity: VisualReviewSeverity;
    category: string;
    message: string;
    elementId?: string;
  }>;
  operations: PresentationOperation[];
};

function resolveReviewerModelId(): string | undefined {
  return (
    process.env.DECK_FORGE_VISUAL_REVIEWER_MODEL_ID?.trim() ||
    process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID?.trim() ||
    undefined
  );
}

function toVisionImage(image: SlideImage): VisionImage | undefined {
  if (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg') {
    return undefined;
  }
  return {
    mediaType: image.mimeType,
    base64: Buffer.from(image.data).toString('base64'),
  };
}

export function createBedrockVisualReviewer(): VisualReviewer {
  const modelId = resolveReviewerModelId();

  return {
    name: 'bedrock-visual-reviewer',
    async review(input: VisualReviewerInput): Promise<VisualReviewerOutput> {
      const log = getLogger();
      const slideImages = input.slideImages ?? [];
      if (slideImages.length === 0) {
        log.warn(
          {},
          '[deck-forge-runtime] [visual-reviewer-bedrock] no slideImages supplied; skipping',
        );
        return { findings: [], operations: [] };
      }

      const slidesById = new Map(input.presentation.slides.map((s) => [s.id, s]));

      const briefSummary = {
        title: input.presentation.brief?.title,
        goal: input.presentation.brief?.goal,
        tone: input.presentation.brief?.tone,
        language: input.presentation.brief?.output?.language,
      };

      const themeSummary = {
        id: input.presentation.theme.id,
        name: input.presentation.theme.name,
        colors: input.presentation.theme.colors,
      };

      const focusList =
        input.focus && input.focus.length > 0
          ? input.focus.join(', ')
          : 'general visual quality';

      const perSlide = await Promise.all(
        slideImages.map(async (image): Promise<ReviewToolOutput | undefined> => {
          const visionImage = toVisionImage(image);
          if (!visionImage) {
            return undefined;
          }
          const slide = slidesById.get(image.slideId);
          if (!slide) {
            return undefined;
          }

          const text = [
            `Brief summary:`,
            JSON.stringify(briefSummary, null, 2),
            '',
            `Theme summary:`,
            JSON.stringify(themeSummary, null, 2),
            '',
            `SlideIR for the rendered image (slideId="${slide.id}"):`,
            JSON.stringify(slide, null, 2),
            '',
            `Focus: ${focusList}`,
            '',
            'Review the rendered slide image above and submit findings + corrective operations via the tool.',
          ].join('\n');

          try {
            return await invokeBedrockVisionToolUse<ReviewToolOutput>({
              system: SYSTEM_PROMPT,
              text,
              images: [visionImage],
              tool: REVIEW_TOOL,
              maxTokens: 4096,
              ...(modelId !== undefined ? { modelId } : {}),
            });
          } catch (error) {
            log.warn(
              {
                slideId: slide.id,
                error: error instanceof Error ? error.message : String(error),
              },
              '[deck-forge-runtime] [visual-reviewer-bedrock] review failed for slide',
            );
            return undefined;
          }
        }),
      );

      const findings: VisualReviewFinding[] = [];
      const operations: PresentationOperation[] = [];

      slideImages.forEach((image, idx) => {
        const result = perSlide[idx];
        if (!result) return;
        const slide = slidesById.get(image.slideId);
        const elementIds = new Set(slide?.elements.map((e) => e.id) ?? []);

        for (const finding of result.findings ?? []) {
          findings.push({
            slideId: image.slideId,
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            ...(finding.elementId ? { elementId: finding.elementId } : {}),
          });
        }

        for (const op of result.operations ?? []) {
          if (!isSafeOp(op, image.slideId, elementIds)) continue;
          operations.push(op);
        }
      });

      log.info(
        {
          slideCount: slideImages.length,
          findingCount: findings.length,
          operationCount: operations.length,
        },
        '[deck-forge-runtime] [visual-reviewer-bedrock] review complete',
      );

      return { findings, operations };
    },
  };
}

function isSafeOp(
  op: PresentationOperation,
  slideId: string,
  elementIds: Set<string>,
): boolean {
  if (!op || typeof op !== 'object' || !('type' in op)) return false;
  if (
    op.type === 'update_text' ||
    op.type === 'delete_element' ||
    op.type === 'set_element_frame' ||
    op.type === 'move_element' ||
    op.type === 'resize_element'
  ) {
    return op.slideId === slideId && elementIds.has(op.elementId);
  }
  if (op.type === 'set_slide_layout') {
    return op.slideId === slideId;
  }
  return false;
}

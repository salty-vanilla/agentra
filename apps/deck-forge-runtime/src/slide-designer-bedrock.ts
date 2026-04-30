import type {
  PresentationOperation,
  SlideDesigner,
  SlideDesignerInput,
  SlideDesignerOutput,
} from '@deck-forge/core';
import { invokeBedrockToolUse } from './bedrock-client.js';
import { getLogger } from './logging.js';

/* ------------------------------------------------------------------ */
/*  Tool schema                                                        */
/* ------------------------------------------------------------------ */

/**
 * Constrained subset of `PresentationOperation`. The designer is allowed to
 * tweak existing element text/style, drop visually noisy elements, swap a
 * slide's layout, or add a missing text element. More invasive ops
 * (add_chart / add_image / apply_theme / remove_slide / move_slide) are
 * intentionally excluded — those belong to higher-level planners.
 */
const PROPOSE_OPS_TOOL = {
  name: 'propose_slide_operations',
  description:
    'Propose a small set of refinement operations for the current slide. Operations are applied verbatim via applyOperations() so every field must reference a real slideId / elementId / regionId.',
  input_schema: {
    type: 'object',
    required: ['operations'],
    properties: {
      rationale: {
        type: 'string',
        description:
          'One- or two-sentence summary of why these operations improve the slide.',
      },
      operations: {
        type: 'array',
        description:
          'Ordered list of operations to apply. Empty array = the slide is already good enough.',
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
                text: {
                  type: 'string',
                  description: 'Replacement plain text for the element.',
                },
                style: {
                  type: 'object',
                  description:
                    'Optional partial TextStyle (fontSize, fontWeight, color, align, lineHeight). Omit if not changing style.',
                },
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
              required: ['type', 'slideId', 'role', 'text'],
              properties: {
                type: { const: 'add_text' },
                slideId: { type: 'string' },
                role: {
                  type: 'string',
                  enum: ['title', 'subtitle', 'body', 'callout', 'footer', 'caption'],
                },
                text: { type: 'string' },
                regionId: { type: 'string' },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'layout'],
              properties: {
                type: { const: 'set_slide_layout' },
                slideId: { type: 'string' },
                layout: {
                  type: 'object',
                  description:
                    'Replacement LayoutSpec (`type` + `regions[]`). Use one of the catalog layouts: title, two-column, single-stack, hero, kpi-grid.',
                },
              },
            },
          ],
        },
      },
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/*  System prompt                                                      */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a senior presentation designer refining a single slide of a larger deck.

You receive:
1. The full SlideIR for the slide you are refining (elements, frames, styles).
2. A short summary of the surrounding presentation (theme, brief, sibling slide titles).
3. An optional focus list (layout / typography / color / hierarchy / decoration).

Your job is to propose a SHORT, idempotent list of operations that meaningfully improve visual quality WITHOUT changing the slide's narrative meaning.

Hard rules:
- Refer ONLY to real slideId / elementId values that appear in the input. Never invent IDs.
- Prefer SHORTER, more focused text. Most overlap/truncation problems come from too much text.
- Keep the original language of the slide.
- Every operation must be one of: update_text, delete_element, add_text, set_slide_layout.
- If the slide is already clean, return operations=[] and a short rationale.
- Aim for 0-4 operations per slide. Do not exceed maxOperations if it is provided.
- Do NOT touch element style colors unless the focus explicitly includes "color".

House style targets (apply silently):
- Titles ≤25 chars (ja) / ≤60 chars (en). Statement-style. 体言止め for ja decks.
- Body bullets ≤30 chars per line (ja) / ≤60 chars (en). Max 5 lines per block.
- Numbers always carry units. Unit goes in its own field, not glued to the value.
- Never repeat the slide title in the body.
- Don't mix 敬体 and 常体 in the same deck.

GOOD example (refining a verbose KPI title):
  Input element: { id: "title-1", text: "今四半期における製造ライン#4の稼働状況について" }
  Operation:    { type: "update_text", slideId: "slide-3", elementId: "title-1",
                  text: "ライン#4 稼働率 92%" }
BAD example (same intent — too long, redundant):
  { type: "update_text", ..., text: "今四半期の稼働率は92%でした" }

Call the propose_slide_operations tool exactly once.`;

/* ------------------------------------------------------------------ */
/*  Designer impl                                                      */
/* ------------------------------------------------------------------ */

type ProposeOpsToolOutput = {
  rationale?: string;
  operations: PresentationOperation[];
};

function resolveDesignerModelId(): string | undefined {
  return (
    process.env.DECK_FORGE_DESIGNER_MODEL_ID?.trim() ||
    process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID?.trim() ||
    undefined
  );
}

export function createBedrockSlideDesigner(): SlideDesigner {
  const modelId = resolveDesignerModelId();

  return {
    name: 'bedrock-slide-designer',
    async designSlide(input: SlideDesignerInput): Promise<SlideDesignerOutput> {
      const log = getLogger();
      const slideId = input.slide.id;

      const slideSummaries = input.presentation.slides.map((s) => ({
        id: s.id,
        index: s.index,
        title: s.title,
      }));

      const userMessage = [
        `Theme summary:`,
        JSON.stringify(
          {
            id: input.theme.id,
            name: input.theme.name,
            colors: input.theme.colors,
            typography: input.theme.typography,
          },
          null,
          2,
        ),
        '',
        `Brief summary:`,
        JSON.stringify(
          {
            title: input.brief?.title,
            goal: input.brief?.goal,
            tone: input.brief?.tone,
            audience: input.brief?.audience?.primary,
            language: input.brief?.output?.language,
          },
          null,
          2,
        ),
        '',
        `Sibling slides (titles only):`,
        JSON.stringify(slideSummaries, null, 2),
        '',
        `Slide to refine (slideId="${slideId}"):`,
        JSON.stringify(input.slide, null, 2),
        '',
        `Focus: ${input.options?.focus?.join(', ') ?? 'general visual quality'}`,
        `maxOperations: ${input.options?.maxOperations ?? 4}`,
        '',
        'Call propose_slide_operations with refinements (or empty operations if none are needed).',
      ].join('\n');

      try {
        const result = await invokeBedrockToolUse<ProposeOpsToolOutput>({
          system: SYSTEM_PROMPT,
          userMessage,
          tool: PROPOSE_OPS_TOOL,
          maxTokens: 4096,
          ...(modelId !== undefined ? { modelId } : {}),
        });

        const operations = sanitizeOperations(
          result.operations ?? [],
          slideId,
          new Set(input.slide.elements.map((e) => e.id)),
        );

        log.info(
          {
            slideId,
            operationCount: operations.length,
            rationale: result.rationale,
          },
          '[deck-forge-runtime] [slide-designer-bedrock] proposed operations',
        );

        return {
          operations,
          ...(result.rationale !== undefined ? { rationale: result.rationale } : {}),
        };
      } catch (error) {
        log.warn(
          {
            slideId,
            error: error instanceof Error ? error.message : String(error),
          },
          '[deck-forge-runtime] [slide-designer-bedrock] design failed; returning empty operations',
        );
        return { operations: [] };
      }
    },
  };
}

/**
 * Drop operations whose slideId/elementId do not match the slide we are
 * designing. The LLM is told to use real IDs, but defensive filtering keeps
 * the loop safe when it slips.
 */
function sanitizeOperations(
  operations: PresentationOperation[],
  slideId: string,
  elementIds: Set<string>,
): PresentationOperation[] {
  return operations.filter((op) => {
    if (!op || typeof op !== 'object' || !('type' in op)) return false;
    if (op.type === 'update_text' || op.type === 'delete_element') {
      return op.slideId === slideId && elementIds.has(op.elementId);
    }
    if (op.type === 'add_text' || op.type === 'set_slide_layout') {
      return op.slideId === slideId;
    }
    return false;
  });
}

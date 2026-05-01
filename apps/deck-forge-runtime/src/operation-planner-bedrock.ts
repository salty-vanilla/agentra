import type { PresentationOperation } from '@deck-forge/core';
import type {
  PlanPresentationOperationsInput,
  PresentationOperationPlanner,
} from '@deck-forge/tools';
import { invokeBedrockToolUse } from './bedrock-client.js';
import { getLogger } from './logging.js';

/* ------------------------------------------------------------------ */
/*  Tool schema                                                        */
/* ------------------------------------------------------------------ */

/**
 * Constrained operation set the planner is allowed to emit. We deliberately
 * exclude `attach_asset` (requires a fully-formed Asset object that the LLM
 * cannot fabricate without bytes / URIs) and the slide-shape ops
 * (`add_slide` / `remove_slide` / `move_slide`) which are too disruptive to
 * apply blindly mid-revision. The same constraints are mirrored in the
 * SlideDesigner.
 */
const PLAN_OPS_TOOL = {
  name: 'plan_presentation_operations',
  description:
    'Propose a small ordered list of operations that fix the supplied review issues. Operations are applied verbatim via applyOperations() so every field must reference a real slideId / elementId.',
  input_schema: {
    type: 'object',
    required: ['operations'],
    properties: {
      rationale: {
        type: 'string',
        description: 'One- or two-sentence summary of the fix strategy. Optional.',
      },
      operations: {
        type: 'array',
        description:
          'Ordered list of operations. Empty array = no actionable fix could be derived from the issues.',
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
                    'Replacement LayoutSpec. Must have a `type` and `regions[]` matching one of: title, two-column, single-stack, hero, kpi-grid.',
                },
              },
            },
            {
              type: 'object',
              required: ['type', 'slideId', 'elementId', 'data'],
              properties: {
                type: { const: 'update_chart_data' },
                slideId: { type: 'string' },
                elementId: { type: 'string' },
                chartType: {
                  type: 'string',
                  enum: ['bar', 'line', 'area', 'pie', 'scatter', 'combo'],
                },
                data: {
                  type: 'object',
                  required: ['series'],
                  properties: {
                    series: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['name', 'values'],
                        properties: {
                          name: { type: 'string' },
                          values: { type: 'array', items: { type: 'number' } },
                        },
                      },
                    },
                    categories: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
} as const;

const PLANNER_SYSTEM_PROMPT = `You are a presentation operation planner. Given a list of review issues and the current presentation IR, produce a short ordered list of operations that fix the issues.

Hard rules:
- Refer ONLY to real slideId / elementId values from the input. Never invent IDs.
- Allowed ops: update_text, delete_element, add_text, set_slide_layout, update_chart_data.
- Do NOT emit attach_asset, add_slide, remove_slide, move_slide, add_image, add_chart, add_table, apply_theme. These require resources / disruption beyond the planner's mandate.
- Prefer SHORTER text. Most overlap/truncation comes from too much text.
- Aim for 0–6 operations total. Return [] if no safe fix can be derived.
- Keep the original language of each slide.

Call plan_presentation_operations exactly once.`;

type PlanOpsToolOutput = {
  rationale?: string;
  operations: PresentationOperation[];
};

export function createBedrockOperationPlanner(): PresentationOperationPlanner {
  return {
    async plan(input: PlanPresentationOperationsInput): Promise<PresentationOperation[]> {
      const log = getLogger();
      const validElementIds = new Set<string>();
      for (const slide of input.presentation.slides) {
        for (const el of slide.elements) {
          validElementIds.add(`${slide.id}::${el.id}`);
        }
      }

      const context = {
        goal: input.goal,
        issueCount: input.issues.length,
        issues: input.issues,
        slideCount: input.presentation.slides.length,
        slides: input.presentation.slides.map((s) => ({
          id: s.id,
          index: s.index,
          title: s.title,
          intent: s.intent,
          elements: s.elements.map((e) => ({ id: e.id, type: e.type })),
        })),
      };

      try {
        const result = await invokeBedrockToolUse<PlanOpsToolOutput>({
          system: PLANNER_SYSTEM_PROMPT,
          userMessage: JSON.stringify(context, null, 2),
          tool: PLAN_OPS_TOOL,
          maxTokens: 4096,
        });

        const safe = sanitizeOperations(result.operations ?? [], validElementIds);
        log.info(
          {
            requested: result.operations?.length ?? 0,
            kept: safe.length,
            rationale: result.rationale,
          },
          '[deck-forge-runtime] [operation-planner-bedrock] proposed operations',
        );
        return safe;
      } catch (error) {
        log.warn(
          { error: error instanceof Error ? error.message : String(error) },
          '[deck-forge-runtime] [operation-planner-bedrock] plan failed; returning []',
        );
        return [];
      }
    },
  };
}

function sanitizeOperations(
  operations: PresentationOperation[],
  validElementIds: Set<string>,
): PresentationOperation[] {
  return operations.filter((op) => {
    if (!op || typeof op !== 'object' || !('type' in op)) return false;
    switch (op.type) {
      case 'update_text':
      case 'delete_element':
      case 'update_chart_data':
      case 'set_element_frame':
      case 'move_element':
      case 'resize_element':
      case 'set_element_region':
      case 'update_element_style':
        return validElementIds.has(`${op.slideId}::${op.elementId}`);
      case 'add_text':
      case 'set_slide_layout':
        return typeof op.slideId === 'string' && op.slideId.length > 0;
      default:
        // Hard reject any op the planner sneaks past the schema.
        return false;
    }
  });
}

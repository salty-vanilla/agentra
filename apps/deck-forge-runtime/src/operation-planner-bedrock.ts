import type { PresentationOperation } from '@deck-forge/core';
import type {
  PlanPresentationOperationsInput,
  PresentationOperationPlanner,
} from '@deck-forge/tools';
import { extractJson, invokeBedrockText } from './bedrock-client.js';

const PLANNER_SYSTEM_PROMPT = `You are a presentation operation planner. Given a list of review issues and the current presentation IR, you produce a JSON array of PresentationOperation objects that fix the issues.

Supported operation types:
- add_slide, remove_slide, move_slide, set_slide_layout
- add_text, update_text
- add_image, add_table, add_chart, update_chart_data
- attach_asset, apply_theme, delete_element

Each operation must have a "type" field matching one of the above.

Rules:
- Only emit operations that directly address the review issues.
- Reference existing slideId and elementId values from the presentation.
- For add_slide, provide layout with type and density.
- For add_text, provide slideId, role, and text.
- Keep operations minimal and focused.

Return ONLY the JSON array of operations, wrapped in a code fence.`;

export function createBedrockOperationPlanner(): PresentationOperationPlanner {
  return {
    async plan(input: PlanPresentationOperationsInput): Promise<PresentationOperation[]> {
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
          elementCount: s.elements.length,
          elements: s.elements.map((e) => ({ id: e.id, type: e.type })),
        })),
      };

      const response = await invokeBedrockText({
        system: PLANNER_SYSTEM_PROMPT,
        userMessage: JSON.stringify(context, null, 2),
        maxTokens: 8192,
      });

      return extractJson<PresentationOperation[]>(response);
    },
  };
}

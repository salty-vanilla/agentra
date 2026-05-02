import type {
  PresentationReviewer,
  ReviewIssue,
  ReviewPresentationInput,
} from '@deck-forge/tools';
import { invokeBedrockText } from './bedrock-client.js';
import { parseJsonFromModelOutput } from './json-extraction.js';
import { getLogger } from './logging.js';

const REVIEW_SYSTEM_PROMPT = `You are a senior presentation quality reviewer. You receive a review packet containing a presentation's validation report, inspect context, grounding constraints, and optionally slide images.

Analyze the presentation and return a JSON array of review issues. Each issue:
{
  "code": "<short_code>",
  "severity": "info" | "warning" | "error",
  "message": "<human-readable description>",
  "slideId": "<optional slide id>",
  "elementId": "<optional element id>",
  "suggestion": "<actionable fix suggestion>"
}

Focus on:
- Content quality: 1 message per slide, clear titles, appropriate depth
- Visual consistency: layout balance, theme adherence, spacing
- Structural issues: missing intents, orphaned assets, duplicate content
- Grounding: does the deck fulfill the user's original goal and constraints?

Return ONLY the JSON array, wrapped in a code fence.`;

export function createBedrockReviewer(): PresentationReviewer {
  return {
    async review(input: ReviewPresentationInput): Promise<ReviewIssue[]> {
      const packetSummary: Record<string, unknown> = {
        goal: input.goal,
        slideCount: input.presentation.slides.length,
        validationReport: input.report,
      };

      if (input.packet) {
        const { slideImages, ...rest } = input.packet as Record<string, unknown>;
        Object.assign(packetSummary, rest);

        if (Array.isArray(slideImages) && slideImages.length > 0) {
          packetSummary.slideImageCount = slideImages.length;
          packetSummary.slideImageNote =
            'Slide images were rendered and available for review.';
        }
      }

      const response = await invokeBedrockText({
        system: REVIEW_SYSTEM_PROMPT,
        userMessage: JSON.stringify(packetSummary, null, 2),
        maxTokens: 8192,
      });

      try {
        const { value } = parseJsonFromModelOutput<ReviewIssue[]>(response);
        return Array.isArray(value) ? value : [];
      } catch (error) {
        getLogger().warn(
          { error: error instanceof Error ? error.message : String(error) },
          '[deck-forge-runtime] [reviewer-bedrock] JSON parse failed; returning [] (graceful degradation)',
        );
        return [];
      }
    },
  };
}

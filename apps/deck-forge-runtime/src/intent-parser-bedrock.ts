import type { IntentParser, StructuredIntent } from '@deck-forge/tools';
import { extractJson, invokeBedrockText } from './bedrock-client.js';

const CREATE_SYSTEM_PROMPT = `You are a senior presentation consultant AI. Given a user request, you must produce a structured JSON object that contains all the artifacts needed to create a high-quality presentation deck.

Return a JSON object with this exact top-level shape:
{
  "mode": "create",
  "confidence": <number 0-1>,
  "missingFields": [],
  "goal": "<user goal>",
  "audience": "<target audience>",
  "slideCount": <number>,
  "tone": "<professional | casual | academic>",
  "visualPreset": "balanced" | "visual_heavy" | "data_heavy",
  "grounding": {
    "language": "<detected language of the request>",
    "requestedSlideCount": <number or null>,
    "mustInclude": [<strings>],
    "mustAvoid": [<strings>]
  },
  "createArtifacts": {
    "brief": { <PresentationBrief> },
    "deckPlan": { <DeckPlan> },
    "slideSpecs": [ <SlideSpec[]> ],
    "assetSpecs": [ <AssetSpec[]> ]
  }
}

Key rules:
- Every slide must have an "intent" with "type", "keyMessage", and "audienceTakeaway".
- Use layout types: title, section, single_column, two_column, comparison, hero, dashboard, timeline, diagram_focus.
- Content blocks: title, subtitle, paragraph, bullet_list, table, chart, image, diagram, metric, callout, code, quote.
- Asset specs: use "generated_image" type with clear prompts, or "retrieved_image" with search queries.
- Keep 1 message per slide. Titles should convey the key point.
- Confidence should be 0.9+ if the request is clear.
- Return ONLY the JSON, wrapped in a code fence.`;

const MODIFY_SYSTEM_PROMPT = `You are a presentation consultant AI. Given a user request and an inspect summary of the current presentation, produce a structured intent for modifying the presentation.

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

export function createBedrockIntentParser(): IntentParser {
  return {
    async parseCreate({ userRequest }): Promise<StructuredIntent> {
      const response = await invokeBedrockText({
        system: CREATE_SYSTEM_PROMPT,
        userMessage: userRequest,
        maxTokens: 16384,
      });

      const intent = extractJson<StructuredIntent>(response);

      if (!intent.createArtifacts) {
        throw new Error(
          'NLU_PARSE_ERROR: Bedrock response did not include createArtifacts.',
        );
      }

      return {
        ...intent,
        mode: 'create',
      };
    },

    async parseModify({ userRequest, inspectSummary }): Promise<StructuredIntent> {
      const message = inspectSummary
        ? `Request: ${userRequest}\n\nCurrent presentation:\n${JSON.stringify(inspectSummary, null, 2)}`
        : userRequest;

      const response = await invokeBedrockText({
        system: MODIFY_SYSTEM_PROMPT,
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

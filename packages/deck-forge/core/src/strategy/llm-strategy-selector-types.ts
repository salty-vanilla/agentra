/**
 * LLM Strategy Selector types — prompt builder and response validation.
 *
 * These types enable external LLM-based strategy selection without making
 * actual LLM API calls within this module. Consumers build the prompt,
 * call their own LLM, then validate the response.
 */

import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategyCandidatePromptItem } from "#src/strategy/strategy-prompt.js";

export interface StrategySelectionPrompt {
  systemMessage: string;
  userMessage: string;
  candidates: StrategyCandidatePromptItem[];
}

export interface LlmStrategySelectionResponse {
  strategyId: string;
  rationale: string;
}

export interface LlmStrategyValidationResult {
  valid: boolean;
  response?: LlmStrategySelectionResponse;
  error?: string;
}

/**
 * Builds an LLM strategy selection prompt from intent and candidate items.
 */
export function buildStrategySelectionPrompt(
  intent: ResolvedSlideIntent,
  candidateItems: StrategyCandidatePromptItem[],
): StrategySelectionPrompt {
  const validIds = candidateItems.map((c) => c.id);

  const systemMessage = [
    "You are a presentation strategy selector.",
    "Given a slide intent and a list of candidate strategies, select the single best strategy.",
    "Respond ONLY with a JSON object containing:",
    '  { "strategyId": "<selected-id>", "rationale": "<brief reason>" }',
    `Valid strategy IDs: ${JSON.stringify(validIds)}`,
  ].join("\n");

  const userMessage = [
    "## Slide Intent",
    `- Key message: ${intent.keyMessage}`,
    `- Audience: ${intent.audience}`,
    `- Genre: ${intent.genre}`,
    `- Intent: ${intent.intent}`,
    `- Content kinds: ${intent.contentKinds.join(", ")}`,
    `- Density: ${intent.density}`,
    intent.audienceTakeaway ? `- Audience takeaway: ${intent.audienceTakeaway}` : "",
    "",
    "## Candidates",
    JSON.stringify(candidateItems, null, 2),
  ]
    .filter(Boolean)
    .join("\n");

  return { systemMessage, userMessage, candidates: candidateItems };
}

/**
 * Validates a raw LLM response for strategy selection.
 * Ensures the response contains a valid strategyId from the candidate set.
 */
export function validateLlmStrategySelectionResponse(
  raw: unknown,
  validCandidateIds: string[],
): LlmStrategyValidationResult {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { valid: false, error: "Response is not an object." };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.strategyId !== "string" || obj.strategyId.length === 0) {
    return { valid: false, error: "Missing or empty strategyId." };
  }

  if (!validCandidateIds.includes(obj.strategyId)) {
    return {
      valid: false,
      error: `strategyId "${obj.strategyId}" is not in the candidate set: [${validCandidateIds.join(", ")}].`,
    };
  }

  if (typeof obj.rationale !== "string" || obj.rationale.length === 0) {
    return { valid: false, error: "Missing or empty rationale." };
  }

  return {
    valid: true,
    response: {
      strategyId: obj.strategyId,
      rationale: obj.rationale,
    },
  };
}

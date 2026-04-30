import type {
  CreatePresentationArtifacts,
  StructuredIntent,
  ValidateAgentCreateArtifactsInput,
  ValidateAgentCreateArtifactsOutput,
} from "#src/types.js";
import {
  GENERIC_FILLER_PATTERNS,
  detectRequestLanguage,
  slideSpecText,
} from "#src/validators/_internal.js";
import { validateBrief } from "#src/validators/validate-brief.js";
import { validateDeckPlan } from "#src/validators/validate-deck-plan.js";
import { validateSlideSpec } from "#src/validators/validate-slide-spec.js";

/**
 * Aggregate validator that runs the per-stage validators plus the cross-cutting
 * checks previously enforced by the throwing implementation. **Non-throwing**:
 * always returns a result; callers decide whether to retry, abort, or proceed
 * with `result.artifacts` (only set when `valid === true`).
 */
export function validateAgentCreateArtifacts(
  input: ValidateAgentCreateArtifactsInput,
): ValidateAgentCreateArtifactsOutput {
  const issues: string[] = [];
  const artifacts = input.intent.createArtifacts;

  if (!artifacts) {
    return {
      valid: false,
      issues: ["intent.createArtifacts is required (must include brief, deckPlan, slideSpecs)"],
    };
  }

  if (!artifacts.brief) {
    issues.push("createArtifacts.brief is required");
  }
  if (!artifacts.deckPlan) {
    issues.push("createArtifacts.deckPlan is required");
  }
  if (!Array.isArray(artifacts.slideSpecs) || artifacts.slideSpecs.length === 0) {
    issues.push("createArtifacts.slideSpecs must contain at least one slide");
  }

  const expectedLanguage =
    input.intent.grounding?.language ?? detectRequestLanguage(input.userRequest);

  if (artifacts.brief) {
    const briefResult = validateBrief(artifacts.brief, { expectedLanguage });
    issues.push(...briefResult.issues);
  }

  const slideSpecs = artifacts.slideSpecs ?? [];
  const slideIds = slideSpecs.map((s) => s.id);
  const requestedSlideCount =
    input.intent.grounding?.requestedSlideCount ?? input.intent.slideCount;

  if (artifacts.deckPlan) {
    const planResult = validateDeckPlan(artifacts.deckPlan, {
      slideIds,
      expectedSlideCount: requestedSlideCount,
    });
    issues.push(...planResult.issues);
  }

  if (requestedSlideCount !== undefined && slideSpecs.length !== requestedSlideCount) {
    issues.push(
      `slide count mismatch: requested ${requestedSlideCount}, received ${slideSpecs.length}`,
    );
  }

  for (const slide of slideSpecs) {
    // Per-slide structural + emptiness checks; skip global must-include /
    // must-avoid here because they apply to the *combined* slide text.
    const slideResult = validateSlideSpec(slide, {
      applyGenericFillerCheck: false,
    });
    issues.push(...slideResult.issues);
  }

  // Global must-include / must-avoid / filler checks across joined slides.
  const slideText = slideSpecs.map((s) => slideSpecText(s)).join("\n");
  const mustInclude = [
    ...(input.intent.grounding?.mustInclude ?? []),
    ...(input.intent.constraints?.mustInclude ?? []),
  ].filter(Boolean);
  for (const required of mustInclude) {
    if (!slideText.includes(required)) {
      issues.push(`missing required user-supplied content: ${required}`);
    }
  }
  const mustAvoid = [
    ...(input.intent.grounding?.mustAvoid ?? []),
    ...(input.intent.constraints?.mustAvoid ?? []),
    ...GENERIC_FILLER_PATTERNS,
  ].filter(Boolean);
  for (const forbidden of mustAvoid) {
    if (slideText.includes(forbidden)) {
      issues.push(`forbidden or generic filler content found: ${forbidden}`);
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    issues: [],
    artifacts: artifacts as CreatePresentationArtifacts,
  };
}

export type { StructuredIntent };

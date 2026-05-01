import { type DeckPlan, DeckPlanSchema } from "@deck-forge/core";
import type { ValidationResult } from "#src/types.js";
import { flattenZodIssues } from "#src/validators/_internal.js";

export type ValidateDeckPlanOptions = {
  /**
   * Optional list of slide ids that the plan should reference. When provided,
   * the validator cross-checks every plan slide id is in this set, and every
   * id in this set is referenced by some plan slide.
   */
  slideIds?: string[];
  /** Optional expected slide count (typically grounding.requestedSlideCount). */
  expectedSlideCount?: number;
};

/**
 * Validate a DeckPlan structurally (via Zod) plus optional cross-checks
 * against an externally-supplied slide-id set.
 */
export function validateDeckPlan(
  deckPlan: unknown,
  options: ValidateDeckPlanOptions = {},
): ValidationResult {
  const parsed = DeckPlanSchema.safeParse(deckPlan);
  if (!parsed.success) {
    return { valid: false, issues: flattenZodIssues("deckPlan", parsed.error) };
  }
  const issues = semanticIssues(parsed.data, options);
  return { valid: issues.length === 0, issues };
}

function semanticIssues(
  deckPlan: DeckPlan,
  { slideIds, expectedSlideCount }: ValidateDeckPlanOptions,
): string[] {
  const issues: string[] = [];
  const planSlideIds = deckPlan.sections.flatMap((section) =>
    section.slides.map((slide) => slide.id),
  );

  if (planSlideIds.length === 0) {
    issues.push("deckPlan.sections must contain at least one slide");
  }

  if (expectedSlideCount !== undefined && planSlideIds.length !== expectedSlideCount) {
    issues.push(
      `deckPlan slide count mismatch: expected ${expectedSlideCount}, planned ${planSlideIds.length}`,
    );
  }

  if (slideIds) {
    const planned = new Set(planSlideIds);
    const provided = new Set(slideIds);
    for (const id of slideIds) {
      if (!planned.has(id)) {
        issues.push(`deckPlan does not reference slide id ${id}`);
      }
    }
    for (const id of planned) {
      if (!provided.has(id)) {
        issues.push(`deckPlan references unknown slide id ${id}`);
      }
    }
  }

  return issues;
}

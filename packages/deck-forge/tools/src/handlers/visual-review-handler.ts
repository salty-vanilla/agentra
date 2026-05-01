import type { VisualReviewer } from "@deck-forge/core";

import type { VisualReviewInput, VisualReviewOutput } from "#src/types.js";

let reviewer: VisualReviewer | undefined;

export function setVisualReviewer(next: VisualReviewer | undefined): void {
  reviewer = next;
}

export function getVisualReviewer(): VisualReviewer | undefined {
  return reviewer;
}

/**
 * Run a `VisualReviewer` over a presentation and return its findings +
 * suggested operations. The reviewer can be supplied per-call via
 * `input.visualReviewer`, or registered once via `setVisualReviewer()`.
 *
 * Note: this handler does NOT apply the returned operations. Callers should
 * pass them through `presentation_apply_operations` (or
 * `applyOperations()`) when they want to materialize the suggestions.
 */
export async function visualReviewHandler(input: VisualReviewInput): Promise<VisualReviewOutput> {
  const active = input.visualReviewer ?? reviewer;
  if (!active) {
    throw new Error(
      "VISUAL_REVIEWER_ERROR: VisualReviewer is not configured. Pass `visualReviewer` in the input or call `setVisualReviewer()`.",
    );
  }
  const result = await active.review({
    presentation: input.presentation,
    slideImages: input.slideImages,
    focus: input.focus,
  });
  return { findings: result.findings, operations: result.operations };
}

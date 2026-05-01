import type { PresentationBrief, PresentationIR, SlideIR, ThemeSpec } from "#src/index.js";
import type { PresentationOperation } from "#src/operations/types.js";

/**
 * Focus areas a designer can be biased toward. A designer is free to ignore
 * unknown / unset focuses.
 */
export type DesignFocus = "layout" | "typography" | "color" | "hierarchy" | "decoration";

export type SlideDesignerInput = {
  slide: SlideIR;
  presentation: PresentationIR;
  theme: ThemeSpec;
  brief?: PresentationBrief;
  options?: {
    focus?: DesignFocus[];
    /**
     * Soft cap on how many operations the designer should propose for this
     * slide. Implementations may exceed it but should aim to stay under.
     */
    maxOperations?: number;
  };
};

export type SlideDesignerOutput = {
  /** Operations to apply via `applyOperations()`. */
  operations: PresentationOperation[];
  /** Optional human-readable explanation of the changes. */
  rationale?: string;
};

/**
 * A `SlideDesigner` proposes refinement operations for a single slide.
 *
 * Implementations are expected to be deterministic when no LLM is involved,
 * and idempotent when re-run on the result of their own previous output.
 *
 * deck-forge ships only the interface and a heuristic reference impl. LLM-
 * powered designers live in agentra (or other downstream packages).
 */
export interface SlideDesigner {
  readonly name: string;
  designSlide(input: SlideDesignerInput): Promise<SlideDesignerOutput>;
}

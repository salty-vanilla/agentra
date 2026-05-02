import type {
  ContentBlock,
  LayoutSpec,
  ResolvedFrame,
  ResolvedRegion,
  SlideSize,
  SlideSpec,
  ThemeSpec,
} from "#src/index.js";
import type {
  TemplateLayoutProfile,
  TemplateProfile,
  TemplateSlotName,
} from "#src/templates/template-profile.js";

/**
 * Hints a layout strategy can attach to a sub-frame assignment so the
 * downstream element builder can adjust styling (font size, alignment,
 * decoration markers).  Hints are advisory; if a hint is unknown or unused
 * the element is still produced with default styling.
 */
export type LayoutHints = {
  /** Multiplier applied to the role's default fontSize (1 = no change). */
  fontScale?: number;
  /** Override paragraph alignment for the produced text element. */
  alignment?: "left" | "center" | "right";
  /**
   * Visual treatment marker.  Exporters may render an accent stripe, surface
   * card, divider, or no decoration based on this value.  Strategies should
   * use it sparingly (e.g. to mark KPI cards).
   */
  decoration?: "accent-bar" | "card" | "divider" | "none";
  /**
   * Suggested role override for produced TextElementIR.  Most strategies
   * leave this undefined and the default role mapping applies.
   */
  role?: "title" | "subtitle" | "body" | "caption" | "callout" | "footer";
};

/** Frame and optional styling hints assigned to a single content block. */
export type SubFrameAssignment = {
  blockId: string;
  frame: ResolvedFrame;
  /**
   * Template slot actually used to produce this frame.
   * Undefined when regionFrames or computed fallback was used.
   */
  slot?: TemplateSlotName;
  /**
   * Template slots that this assignment attempted to use but were missing.
   * Used only for diagnostics.
   */
  fallbackSlots?: TemplateSlotName[];
  hints?: LayoutHints;
};

/**
 * Indicates how the layout strategy consumed its input data.
 * - "native": valid StrategyInput was consumed directly
 * - "legacy-fallback": fell back to contentBlocks (no valid strategyInput)
 * - "invalid-fallback": strategyInput failed validation but legacy contentBlocks were used
 * - "invalid": strategyInput was present and failed validation, no usable contentBlocks
 * - "missing": no strategyInput and no usable contentBlocks
 */
export type StrategyInputMode = "native" | "legacy-fallback" | "invalid-fallback" | "invalid" | "missing";

/** Inputs every layout strategy receives. */
export type LayoutContext = {
  slideSpec: SlideSpec;
  layoutSpec: LayoutSpec;
  regions: ResolvedRegion[];
  theme: ThemeSpec;
  slideSize: SlideSize;
  /**
   * Transitional fallback content blocks.
   *
   * Built-in strategies should prefer `strategyInput`. This field remains
   * only to support older pipelines during migration. When a valid
   * `strategyInput` exists, strategies MUST NOT inspect these blocks.
   *
   * TODO(Phase 8H+): remove after runtime emits StrategyInput for all slides.
   */
  blocks: ContentBlock[];
  /**
   * Frames the outer builder pre-computed for the available regions.  A
   * strategy should subdivide / re-arrange these frames; it does not need to
   * know the absolute slide padding.
   */
  regionFrames: {
    body: ResolvedFrame;
    visual: ResolvedFrame;
    callout: ResolvedFrame;
    table: ResolvedFrame;
  };
  templateProfile: TemplateProfile;
  templateLayout: TemplateLayoutProfile;
  templateSlots: Partial<Record<TemplateSlotName, ResolvedFrame>>;
  /**
   * Semantic strategy input attached by Phase 8D bridge or pipeline.
   * If present, migrated strategies consume this directly instead of
   * parsing contentBlocks.
   */
  strategyInput?: unknown;
  /** How the strategyInput was produced. */
  strategyInputSource?: "llm" | "deterministic" | "fallback" | "attached" | "none";
};

/**
 * Result of a layout strategy's `layout()` call.
 *
 * Can be either a plain array of SubFrameAssignments (transitional legacy)
 * or a richer result object with StrategyInput trace metadata.
 *
 * @transitional The plain `SubFrameAssignment[]` form is kept only for
 * non-business utility strategies (title-slide, section-divider, etc.).
 * All 17 business strategies now return the rich object form.
 * TODO(Phase 8H+): collapse LayoutResult after contentBlocks fallback is removed.
 */
export type LayoutResult = SubFrameAssignment[] | {
  assignments: SubFrameAssignment[];
  /** Synthetic blocks generated from StrategyInput to be used by the element loop. */
  syntheticBlocks?: ContentBlock[];
  strategyInputMode: StrategyInputMode;
  strategyInputWarnings?: string[];
};

/**
 * A LayoutStrategy decides how to place body-region content blocks for a
 * single slide.  The strategy id intentionally matches the
 * `templates/components/*.json` component id so a future component-driven
 * IR builder can pick a strategy by component reference.
 */
export interface LayoutStrategy {
  /** Stable identifier; mirrors `ComponentSpec.id` where applicable. */
  id: string;
  /**
   * Legacy visual capability key.
   *
   * Not the same as `StrategyManifest.capabilities`.
   * Prefer StrategyManifest + strategyId for new selection code.
   *
   * @legacy Used only by component-catalog; not used for strategy selection.
   * TODO(Phase 8H+): remove after selector no longer depends on capability dispatch.
   */
  capability: string;
  /** Higher number = considered first by `selectLayoutStrategy()`. */
  priority: number;
  /** Returns true when this strategy can produce a layout for the slide. */
  match(ctx: LayoutContext): boolean;
  /** Produces frame assignments keyed by content block id. */
  layout(ctx: LayoutContext): LayoutResult;
}

/** Extract the assignments array from a LayoutResult (array or object). */
export function normalizeLayoutResult(result: LayoutResult): SubFrameAssignment[] {
  return Array.isArray(result) ? result : result.assignments;
}

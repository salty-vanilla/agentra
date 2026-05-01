import type {
  ContentBlock,
  LayoutSpec,
  ResolvedFrame,
  ResolvedRegion,
  SlideSize,
  SlideSpec,
  ThemeSpec,
} from "#src/index.js";

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
  hints?: LayoutHints;
};

/** Inputs every layout strategy receives. */
export type LayoutContext = {
  slideSpec: SlideSpec;
  layoutSpec: LayoutSpec;
  regions: ResolvedRegion[];
  theme: ThemeSpec;
  slideSize: SlideSize;
  /**
   * Content blocks the strategy is responsible for placing.  The
   * outer builder removes title/subtitle blocks and feeds the strategy the
   * remaining body / table / image / callout / metric / etc. blocks.
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
  /** Human-readable capability name; mirrors `detectCapability()` output. */
  capability: string;
  /** Higher number = considered first by `selectLayoutStrategy()`. */
  priority: number;
  /** Returns true when this strategy can produce a layout for the slide. */
  match(ctx: LayoutContext): boolean;
  /** Produces frame assignments keyed by content block id. */
  layout(ctx: LayoutContext): SubFrameAssignment[];
}

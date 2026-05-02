import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Title slide: large centered title with optional subtitle / footer.  The
 * outer builder still emits the title element from `slideSpec.title`; this
 * strategy handles any non-title content blocks (subtitle, paragraph used
 * as tagline, footer-style caption) by assigning them fixed centered positions.
 */
export const titleSlideStrategy: LayoutStrategy = {
  id: "title-slide",
  capability: "title_slide",
  priority: 80,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "title";
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    // Fixed positions for title-slide content blocks (1280×720 canvas).
    // Subtitle sits below the main title; additional blocks stack further down.
    const SLIDE_WIDTH = 1280;
    const CONTENT_MARGIN = 120;
    const CONTENT_WIDTH = SLIDE_WIDTH - CONTENT_MARGIN * 2; // 1040

    // Vertical positions for up to 3 content blocks (subtitle, tagline, footer)
    const FIXED_POSITIONS = [
      { y: 340, height: 80 },  // subtitle
      { y: 440, height: 60 },  // tagline / paragraph
      { y: 600, height: 40 },  // footer
    ];

    return ctx.blocks.map((block, index) => {
      const pos = FIXED_POSITIONS[Math.min(index, FIXED_POSITIONS.length - 1)]!;
      return {
        blockId: block.id,
        frame: {
          x: CONTENT_MARGIN,
          y: pos.y,
          width: CONTENT_WIDTH,
          height: pos.height,
        },
        slot: ctx.templateSlots.body ? ("body" as const) : undefined,
        hints: { alignment: "center" as const, fontScale: index === 0 ? 1.2 : 1.0 },
      };
    });
  },
};

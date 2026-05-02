import { splitHorizontal } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { EventTimelineInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Timeline: lays body blocks out horizontally as evenly-spaced events
 * along the body region.  Each event/block gets the same fixed-height
 * card spanning the full body height.
 */
export const eventTimelineStrategy: LayoutStrategy = {
  id: "event-timeline",
  capability: "event_timeline",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<EventTimelineInput>({ strategyId: "event-timeline", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    return ctx.layoutSpec.type === "timeline";
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<EventTimelineInput>({ strategyId: "event-timeline", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      for (const [i, evt] of inp.events.entries()) {
        const text = `${evt.label}${evt.dateOrPhase ? " — " + evt.dateOrPhase : ""}${evt.description ? "\n" + evt.description : ""}`;
        syntheticBlocks.push({ id: `si-paragraph-${i}`, type: "paragraph", text });
      }
      if (inp.keyTakeaway) {
        syntheticBlocks.push({ id: "si-callout-0", type: "callout", text: inp.keyTakeaway, tone: "info" });
      }
      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }
    const assignments = layoutBlocks(ctx);
    const mode = sir.mode === "invalid" && ctx.blocks.length > 0 ? "invalid-fallback" as const : sir.mode;
    return { assignments, strategyInputMode: mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
  const density = ctx.layoutSpec.density;
  const body = ctx.regionFrames.body;
  const visual = ctx.regionFrames.visual;

  const left = Math.min(body.x, visual.x);
  const right = Math.max(body.x + body.width, visual.x + visual.width);
  const top = Math.min(body.y, visual.y);
  const bottom = Math.max(body.y + body.height, visual.y + visual.height);

  const region = { x: left, y: top, width: right - left, height: bottom - top };
  const count = Math.max(1, ctx.blocks.length);
  const cells = splitHorizontal(region, count, density);

  return ctx.blocks.map((block, index) => ({
    blockId: block.id,
    frame: cells[index] ?? region,
    hints: { decoration: "card" as const, alignment: "center" as const },
  }));
}

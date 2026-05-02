import { splitGrid } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { TwoAxisMatrixInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Matrix: arranges body blocks in a 2x2 grid (the canonical "four
 * quadrants" layout).  Extra blocks beyond four reuse the last quadrant
 * frame (validation surfaces resulting overlap).
 */
export const twoAxisMatrixStrategy: LayoutStrategy = {
  id: "two-axis-matrix",
  capability: "two_axis_matrix",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<TwoAxisMatrixInput>({ strategyId: "two-axis-matrix", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    return ctx.layoutSpec.type === "matrix";
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<TwoAxisMatrixInput>({ strategyId: "two-axis-matrix", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      for (const [i, item] of inp.items.entries()) {
        const text = `${item.label} [${item.x}/${item.y}]${item.description ? "\n" + item.description : ""}`;
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
  const callout = ctx.regionFrames.callout;

  const left = Math.min(body.x, visual.x);
  const right = Math.max(body.x + body.width, visual.x + visual.width);
  const top = Math.min(body.y, visual.y);
  const bottom = Math.max(body.y + body.height, callout.y + callout.height);

  const region = { x: left, y: top, width: right - left, height: bottom - top };
  const cells = splitGrid(region, 2, 2, density);

  return ctx.blocks.map((block, index) => ({
    blockId: block.id,
    frame: cells[Math.min(index, cells.length - 1)] ?? region,
    hints: { decoration: "card" as const, alignment: "center" as const },
  }));
}

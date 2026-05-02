import {
  countByType,
  hasChart,
  hasTable,
  isDataInsightIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { DataInsightStoryInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

/**
 * Data Insight Story: a chart or table as the primary visual with a
 * structured insight stack (what / why / action) below.  Designed for
 * data-driven narrative slides that explain a single finding.
 */
export const dataInsightStoryStrategy: LayoutStrategy = {
  id: "data-insight-story",
  capability: "data_insight_story",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<DataInsightStoryInput>({ strategyId: "data-insight-story", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (!isDataInsightIntent(ctx)) return false;
    if (!(hasChart(ctx.blocks) || hasTable(ctx.blocks))) return false;
    const calloutCount = countByType(ctx.blocks, "callout");
    const paragraphCount = countByType(ctx.blocks, "paragraph");
    if (calloutCount < 1 && paragraphCount < 2) return false;
    return ctx.blocks.length <= 10;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<DataInsightStoryInput>({ strategyId: "data-insight-story", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      // Visual placeholder from dataSummary or visualTitle
      syntheticBlocks.push({
        id: "si-paragraph-0",
        type: "paragraph",
        text: inp.dataSummary ?? inp.visualTitle ?? "Data visual",
      });

      // Insight headline + detail as callout
      const insightText = inp.insight.headline + (inp.insight.detail ? `\n${inp.insight.detail}` : "");
      syntheticBlocks.push({
        id: "si-callout-0",
        type: "callout",
        text: insightText,
        tone: "info",
      });

      if (inp.insight.implication) {
        syntheticBlocks.push({
          id: "si-paragraph-1",
          type: "paragraph",
          text: inp.insight.implication,
        });
      }

      if (inp.keyTakeaway) {
        syntheticBlocks.push({
          id: "si-callout-1",
          type: "callout",
          text: inp.keyTakeaway,
          tone: "info",
        });
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
    const region = mergeAllRegions(ctx);

    // Separate visual blocks (chart/table) from insight blocks
    const visualBlocks = ctx.blocks.filter(
      (b) => b.type === "chart" || b.type === "table",
    );
    const insightBlocks = ctx.blocks.filter(
      (b) => b.type === "callout" || b.type === "paragraph",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "chart" &&
        b.type !== "table" &&
        b.type !== "callout" &&
        b.type !== "paragraph",
    );

    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots via helper
    const visualRes = resolveSlotFrame(ctx, "visual", region);
    const insightRes = resolveSlotFrame(ctx, ["insight", "callout"], region);

    // Visual area (top ~60%) + insight stack (bottom ~35%)
    const { top: visualRegion, bottom: insightRegion } = splitTopBottom(
      region,
      0.6,
    );

    // Visual blocks in upper region
    const computedVisual = visualRes.slot ? visualRes : { ...visualRes, frame: visualRegion };
    const visualFrames = splitVertical(
      computedVisual.frame,
      visualBlocks.length,
      density,
    );
    visualBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedVisual,
          frame: visualFrames[i] ?? visualRegion,
        }),
      );
    });

    // Insight + other blocks in lower region
    const lowerBlocks = [...insightBlocks, ...otherBlocks];
    const computedInsight = insightRes.slot ? insightRes : { ...insightRes, frame: insightRegion };
    const lowerFrames = splitVertical(
      computedInsight.frame,
      lowerBlocks.length,
      density,
    );
    lowerBlocks.forEach((block, i) => {
      const isFirst = i === 0;
      const isCallout = block.type === "callout";
      const isInsightBlock = isCallout || block.type === "paragraph";
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: isInsightBlock ? computedInsight : { frame: insightRegion, fallbackSlots: [] },
          frame: lowerFrames[i] ?? insightRegion,
          hints:
            isCallout || isFirst
              ? {
                  decoration: "accent-bar",
                  ...(isFirst ? { fontScale: 1.05 } : {}),
                  ...(isCallout ? { role: "callout" as const } : {}),
                }
              : undefined,
        }),
      );
    });

    return assignments;
}
import {
  countByType,
  createHorizontalCards,
  createInsightBand,
  hasRoadmapSignals,
  isTimelineIntent,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { ImplementationRoadmapInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Implementation Roadmap: horizontal phase cards with a risk/next-step
 * band at the bottom.  Designed for project timelines, rollout plans,
 * and phased implementation slides.
 */
export const implementationRoadmapStrategy: LayoutStrategy = {
  id: "implementation-roadmap",
  capability: "implementation_roadmap",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<ImplementationRoadmapInput>({ strategyId: "implementation-roadmap", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (ctx.blocks.length > 10) return false;
    if (hasRoadmapSignals(ctx)) return true;

    // Timeline intent + enough content to form phases
    if (isTimelineIntent(ctx)) {
      const textCount =
        countByType(ctx.blocks, "paragraph") +
        countByType(ctx.blocks, "bullet_list");
      return textCount >= 3;
    }
    return false;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<ImplementationRoadmapInput>({ strategyId: "implementation-roadmap", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      for (const [i, ms] of inp.milestones.entries()) {
        const text = `${ms.label}${ms.dateOrPhase ? " — " + ms.dateOrPhase : ""}${ms.description ? "\n" + ms.description : ""}`;
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
  const region = mergeAllRegions(ctx);

  // Separate callout/risk blocks from phase blocks
  const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
  const phaseBlocks = ctx.blocks.filter((b) => b.type !== "callout");

  const assignments: SubFrameAssignment[] = [];

  // Resolve template slots via helper
  const processRes = resolveSlotFrame(ctx, ["process", "milestones"], region);
  const calloutRes = resolveSlotFrame(ctx, "callout", region);

  if (calloutBlocks.length === 0) {
    // All blocks as horizontal phase cards
    const count = Math.min(phaseBlocks.length, 5);
    const computedProcess = processRes.slot ? processRes : { ...processRes, frame: region };
    const cards = createHorizontalCards(computedProcess.frame, count, density);
    phaseBlocks.slice(0, count).forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedProcess,
          frame: cards[i] ?? region,
          hints: { decoration: "card" },
        }),
      );
    });
    // Remaining blocks stacked below last card
    if (phaseBlocks.length > count) {
      const remaining = phaseBlocks.slice(count);
      const lastCard = cards[count - 1] ?? region;
      const extraFrames = splitVertical(
        {
          x: lastCard.x,
          y: lastCard.y + lastCard.height + 16,
          width: region.width,
          height: Math.max(60, region.height - lastCard.height - 16),
        },
        remaining.length,
        density,
      );
      remaining.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: extraFrames[i] ?? region,
        });
      });
    }
    return assignments;
  }

  // Phase cards (top ~65%) + risk/next-step band (bottom)
  const { main: phaseRegion, band: riskBand } = createInsightBand(
    region,
    Math.round(region.height * 0.25),
  );

  const phaseCount = Math.min(phaseBlocks.length, 5);
  const computedProcess = processRes.slot ? processRes : { ...processRes, frame: phaseRegion };
  const cards = createHorizontalCards(computedProcess.frame, phaseCount, density);
  phaseBlocks.slice(0, phaseCount).forEach((block, i) => {
    assignments.push(
      assignmentFromSlot({
        blockId: block.id,
        resolution: computedProcess,
        frame: cards[i] ?? phaseRegion,
        hints: { decoration: "card" },
      }),
    );
  });

  // Extra phase blocks beyond 5
  if (phaseBlocks.length > phaseCount) {
    const remaining = phaseBlocks.slice(phaseCount);
    const extraFrames = splitVertical(riskBand, remaining.length + calloutBlocks.length, density);
    remaining.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: extraFrames[i] ?? riskBand,
      });
    });
    calloutBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: calloutRes,
          frame: extraFrames[remaining.length + i] ?? riskBand,
          hints: { decoration: "accent-bar", role: "callout" },
        }),
      );
    });
  } else {
    // Callout blocks in risk band
    const computedCallout = calloutRes.slot ? calloutRes : { ...calloutRes, frame: riskBand };
    const bandFrames = splitVertical(computedCallout.frame, calloutBlocks.length, density);
    calloutBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedCallout,
          frame: bandFrames[i] ?? riskBand,
          hints: { decoration: "accent-bar", role: "callout" },
        }),
      );
    });
  }

  return assignments;
}

import {
  countByType,
  createHorizontalCards,
  createInsightBand,
  hasRoadmapSignals,
  isTimelineIntent,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
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

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Separate callout/risk blocks from phase blocks
    const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const phaseBlocks = ctx.blocks.filter((b) => b.type !== "callout");

    const assignments: SubFrameAssignment[] = [];

    if (calloutBlocks.length === 0) {
      // All blocks as horizontal phase cards
      const count = Math.min(phaseBlocks.length, 5);
      const cards = createHorizontalCards(region, count, density);
      phaseBlocks.slice(0, count).forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: cards[i] ?? region,
          hints: { decoration: "card" },
        });
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
    const cards = createHorizontalCards(phaseRegion, phaseCount, density);
    phaseBlocks.slice(0, phaseCount).forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: cards[i] ?? phaseRegion,
        hints: { decoration: "card" },
      });
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
        assignments.push({
          blockId: block.id,
          frame: extraFrames[remaining.length + i] ?? riskBand,
          hints: { decoration: "accent-bar", role: "callout" },
        });
      });
    } else {
      // Callout blocks in risk band
      const bandFrames = splitVertical(riskBand, calloutBlocks.length, density);
      calloutBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: bandFrames[i] ?? riskBand,
          hints: { decoration: "accent-bar", role: "callout" },
        });
      });
    }

    return assignments;
  },
};

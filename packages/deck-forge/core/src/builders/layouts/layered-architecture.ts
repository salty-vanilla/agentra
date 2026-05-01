import {
  countBulletItems,
  hasArchitectureSignals,
  hasDiagram,
  isArchitectureIntent,
  mergeAllRegions,
  splitMainSidebar,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Layered Architecture: horizontal layer bands stacked vertically with an
 * optional sidebar for design principles.  Designed for system architecture,
 * technology stack, and infrastructure overview slides.
 */
export const layeredArchitectureStrategy: LayoutStrategy = {
  id: "layered-architecture",
  capability: "layered_architecture",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.blocks.length > 10) return false;
    const hasSignals =
      hasArchitectureSignals(ctx) || isArchitectureIntent(ctx);
    if (!hasSignals) return false;

    // Need diagram or enough bullet items to form layers
    return hasDiagram(ctx.blocks) || countBulletItems(ctx.blocks) >= 3;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Separate callout/sidebar blocks from layer blocks
    const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const diagramBlocks = ctx.blocks.filter((b) => b.type === "diagram");
    const layerBlocks = ctx.blocks.filter(
      (b) => b.type !== "callout" && b.type !== "diagram",
    );

    const assignments: SubFrameAssignment[] = [];

    // If there's a diagram, give it the main area
    if (diagramBlocks.length > 0) {
      if (calloutBlocks.length > 0) {
        // Diagram (main 75%) + callout sidebar (25%)
        const { main: diagramRegion, sidebar: sideRegion } = splitMainSidebar(
          region,
          0.75,
        );

        diagramBlocks.forEach((block) => {
          assignments.push({
            blockId: block.id,
            frame: diagramRegion,
          });
        });

        const sideFrames = splitVertical(
          sideRegion,
          calloutBlocks.length + layerBlocks.length,
          density,
        );
        calloutBlocks.forEach((block, i) => {
          assignments.push({
            blockId: block.id,
            frame: sideFrames[i] ?? sideRegion,
            hints: { role: "callout" },
          });
        });
        layerBlocks.forEach((block, i) => {
          assignments.push({
            blockId: block.id,
            frame: sideFrames[calloutBlocks.length + i] ?? sideRegion,
          });
        });
      } else {
        // Diagram only — split remaining blocks below
        const allBlocks = [...diagramBlocks, ...layerBlocks];
        const frames = splitVertical(region, allBlocks.length, density);
        allBlocks.forEach((block, i) => {
          assignments.push({
            blockId: block.id,
            frame: frames[i] ?? region,
          });
        });
      }
      return assignments;
    }

    // No diagram — stack layer blocks as horizontal bands
    const hasCallout = calloutBlocks.length > 0;

    if (!hasCallout) {
      // All blocks as layer bands
      const bandCount = Math.min(layerBlocks.length, 5);
      const frames = splitVertical(region, bandCount, density);
      layerBlocks.slice(0, bandCount).forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: frames[i] ?? region,
          hints: { decoration: "card", alignment: "center" },
        });
      });
      return assignments;
    }

    // Layer bands (main 75%) + callout sidebar (25%)
    const { main: layerRegion, sidebar: sideRegion } = splitMainSidebar(
      region,
      0.75,
    );

    const bandCount = Math.min(layerBlocks.length, 5);
    const frames = splitVertical(layerRegion, bandCount, density);
    layerBlocks.slice(0, bandCount).forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: frames[i] ?? layerRegion,
        hints: { decoration: "card", alignment: "center" },
      });
    });

    const sideFrames = splitVertical(
      sideRegion,
      calloutBlocks.length,
      density,
    );
    calloutBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: sideFrames[i] ?? sideRegion,
        hints: { role: "callout" },
      });
    });

    return assignments;
  },
};

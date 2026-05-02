import {
  countBulletItems,
  hasArchitectureSignals,
  hasDiagram,
  isArchitectureIntent,
  mergeAllRegions,
  splitMainSidebar,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { LayeredArchitectureInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

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
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<LayeredArchitectureInput>({ strategyId: "layered-architecture", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (ctx.blocks.length > 10) return false;
    const hasSignals =
      hasArchitectureSignals(ctx) || isArchitectureIntent(ctx);
    if (!hasSignals) return false;

    // Need diagram or enough bullet items to form layers
    return hasDiagram(ctx.blocks) || countBulletItems(ctx.blocks) >= 3;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<LayeredArchitectureInput>({ strategyId: "layered-architecture", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      inp.layers.forEach((layer, li) => {
        syntheticBlocks.push({
          id: `si-paragraph-${li}`,
          type: "paragraph",
          text: layer.name + (layer.responsibility ? ` — ${layer.responsibility}` : ""),
        });
        syntheticBlocks.push({
          id: `si-bullet_list-${li}`,
          type: "bullet_list",
          items: layer.components.map((c) => ({ text: c })),
        });
      });

      if (inp.keyTakeaway) {
        syntheticBlocks.push({
          id: "si-callout-0",
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
}

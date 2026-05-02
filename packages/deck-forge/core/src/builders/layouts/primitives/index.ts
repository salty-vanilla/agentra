/**
 * Layout Primitives — composable placement functions that return
 * SubFrameAssignment[] so strategies don't need to compute coordinates.
 *
 * Each primitive ensures:
 * - Frames are inside the given region
 * - No duplicate frames are returned
 * - Minimum height constraints are respected
 */
import {
  createMetricRail,
  createSmallMultiplesGrid as rawSmallMultiples,
  createApprovalItemFrames,
  splitVertical,
  splitHorizontal,
  gapForDensity,
  MIN_SUBFRAME_HEIGHT,
} from "#src/builders/layouts/grid-utils.js";
import type { SubFrameAssignment, LayoutHints } from "#src/builders/layouts/types.js";
import type { ContentBlock, LayoutSpec, ResolvedFrame } from "#src/index.js";

// ---------------------------------------------------------------------------
// metricRail
// ---------------------------------------------------------------------------

export function layoutMetricRail(input: {
  region: ResolvedFrame;
  blocks: ContentBlock[];
  density?: LayoutSpec["density"];
  maxColumns?: number;
  gap?: number;
}): SubFrameAssignment[] {
  const { region, blocks, gap } = input;
  if (blocks.length === 0) return [];

  const frames = createMetricRail(region, blocks.length, {
    minCardHeight: 120,
    maxCardHeight: Math.min(160, region.height),
    gap: gap ?? 20,
  });

  return blocks.map((block, i) => ({
    blockId: block.id,
    frame: frames[i] ?? region,
    hints: { decoration: "card" as const, alignment: "center" as const, fontScale: 1.1 },
  }));
}

// ---------------------------------------------------------------------------
// cardGrid — for approval items, initiative cards, comparison cards
// ---------------------------------------------------------------------------

export function layoutCardGrid(input: {
  region: ResolvedFrame;
  blocks: ContentBlock[];
  density?: LayoutSpec["density"];
}): SubFrameAssignment[] {
  const { region, blocks, density } = input;
  if (blocks.length === 0) return [];

  const frames = createApprovalItemFrames(region, blocks.length, density);
  return blocks.map((block, i) => ({
    blockId: block.id,
    frame: frames[i] ?? region,
    hints: { decoration: "card" as const },
  }));
}

// ---------------------------------------------------------------------------
// bottomCallout — single callout anchored to a region
// ---------------------------------------------------------------------------

export function layoutBottomCallout(input: {
  region: ResolvedFrame;
  block?: ContentBlock;
  height?: number;
}): SubFrameAssignment[] {
  const { region, block, height } = input;
  if (!block) return [];

  const h = Math.min(height ?? 80, region.height);
  const frame: ResolvedFrame = {
    x: region.x,
    y: region.y + region.height - h,
    width: region.width,
    height: h,
  };

  return [
    {
      blockId: block.id,
      frame,
      hints: {
        role: "callout" as const,
        decoration: "accent-bar" as const,
        fontScale: 1.05,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// smallMultiplesGrid — for 2–4 chart panels
// ---------------------------------------------------------------------------

export function layoutSmallMultiplesGrid(input: {
  region: ResolvedFrame;
  chartBlocks: ContentBlock[];
  density?: LayoutSpec["density"];
}): SubFrameAssignment[] {
  const { region, chartBlocks, density } = input;
  if (chartBlocks.length === 0) return [];

  const frames = rawSmallMultiples(region, chartBlocks.length, density);
  return chartBlocks.map((block, i) => ({
    blockId: block.id,
    frame: frames[i] ?? region,
  }));
}

// ---------------------------------------------------------------------------
// processRail — horizontal steps
// ---------------------------------------------------------------------------

export function layoutProcessRail(input: {
  region: ResolvedFrame;
  processBlock: ContentBlock;
  density?: LayoutSpec["density"];
}): SubFrameAssignment[] {
  // Process/diagram blocks are single elements that the exporter renders
  return [
    {
      blockId: input.processBlock.id,
      frame: input.region,
    },
  ];
}

// ---------------------------------------------------------------------------
// sidecarStack — vertical stack for supporting content
// ---------------------------------------------------------------------------

export function layoutSidecarStack(input: {
  region: ResolvedFrame;
  blocks: ContentBlock[];
  density?: LayoutSpec["density"];
}): SubFrameAssignment[] {
  const { region, blocks, density } = input;
  if (blocks.length === 0) return [];

  const frames = splitVertical(region, blocks.length, density);
  return blocks.map((block, i) => ({
    blockId: block.id,
    frame: frames[i] ?? region,
  }));
}

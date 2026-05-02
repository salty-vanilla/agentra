import { describe, it, expect } from "vitest";
import {
  layoutMetricRail,
  layoutCardGrid,
  layoutBottomCallout,
  layoutSmallMultiplesGrid,
  layoutProcessRail,
  layoutSidecarStack,
} from "@deck-forge/core";
import type { ContentBlock, ResolvedFrame } from "@deck-forge/core";

function makeRegion(overrides: Partial<ResolvedFrame> = {}): ResolvedFrame {
  return { x: 80, y: 100, width: 1120, height: 500, ...overrides };
}

function makeMetricBlocks(count: number): ContentBlock[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `metric-${i + 1}`,
    type: "metric" as const,
    label: `M${i + 1}`,
    value: `${(i + 1) * 10}`,
    unit: "%",
  }));
}

function makeCalloutBlocks(count: number): ContentBlock[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `callout-${i + 1}`,
    type: "callout" as const,
    text: `Callout ${i + 1}`,
    tone: "info" as const,
  }));
}

function noOverlaps(frames: { frame: ResolvedFrame }[]): boolean {
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i].frame;
      const b = frames[j].frame;
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (overlapX > 1 && overlapY > 1) return false;
    }
  }
  return true;
}

function allInsideRegion(frames: { frame: ResolvedFrame }[], region: ResolvedFrame): boolean {
  for (const f of frames) {
    if (f.frame.x < region.x - 1) return false;
    if (f.frame.y < region.y - 1) return false;
    if (f.frame.x + f.frame.width > region.x + region.width + 1) return false;
    if (f.frame.y + f.frame.height > region.y + region.height + 1) return false;
  }
  return true;
}

describe("layoutMetricRail", () => {
  it("returns empty for 0 blocks", () => {
    expect(layoutMetricRail({ region: makeRegion(), blocks: [] })).toHaveLength(0);
  });

  it.each([1, 2, 3, 4, 5, 6])("places %d metrics without overlap", (count) => {
    const region = makeRegion();
    const assignments = layoutMetricRail({ region, blocks: makeMetricBlocks(count) });
    expect(assignments).toHaveLength(count);
    expect(noOverlaps(assignments)).toBe(true);
    expect(allInsideRegion(assignments, region)).toBe(true);
  });

  it("gives each metric a card decoration hint", () => {
    const assignments = layoutMetricRail({
      region: makeRegion(),
      blocks: makeMetricBlocks(3),
    });
    for (const a of assignments) {
      expect(a.hints?.decoration).toBe("card");
    }
  });
});

describe("layoutCardGrid", () => {
  it("returns empty for 0 blocks", () => {
    expect(layoutCardGrid({ region: makeRegion(), blocks: [] })).toHaveLength(0);
  });

  it.each([1, 2, 3, 4, 5, 6])("places %d items without overlap", (count) => {
    const region = makeRegion();
    const assignments = layoutCardGrid({ region, blocks: makeCalloutBlocks(count) });
    expect(assignments).toHaveLength(count);
    expect(noOverlaps(assignments)).toBe(true);
  });
});

describe("layoutBottomCallout", () => {
  it("returns empty when no block", () => {
    expect(layoutBottomCallout({ region: makeRegion() })).toHaveLength(0);
  });

  it("places callout at bottom of region", () => {
    const region = makeRegion();
    const block = makeCalloutBlocks(1)[0];
    const assignments = layoutBottomCallout({ region, block });
    expect(assignments).toHaveLength(1);
    // Should be at bottom
    expect(assignments[0].frame.y + assignments[0].frame.height).toBe(region.y + region.height);
  });

  it("stays inside region", () => {
    const region = makeRegion();
    const block = makeCalloutBlocks(1)[0];
    const assignments = layoutBottomCallout({ region, block, height: 80 });
    expect(allInsideRegion(assignments, region)).toBe(true);
  });
});

describe("layoutSmallMultiplesGrid", () => {
  it("returns empty for 0 charts", () => {
    expect(layoutSmallMultiplesGrid({ region: makeRegion(), chartBlocks: [] })).toHaveLength(0);
  });

  it.each([2, 3, 4])("places %d charts without overlap", (count) => {
    const region = makeRegion();
    const charts = Array.from({ length: count }, (_, i) => ({
      id: `chart-${i}`,
      type: "chart" as const,
      chartType: "line" as const,
      data: { series: [], categories: [] },
      encoding: {},
    }));
    const assignments = layoutSmallMultiplesGrid({ region, chartBlocks: charts });
    expect(assignments).toHaveLength(count);
    expect(noOverlaps(assignments)).toBe(true);
  });
});

describe("layoutProcessRail", () => {
  it("returns single assignment for process block", () => {
    const region = makeRegion();
    const block: ContentBlock = {
      id: "diagram-1",
      type: "diagram",
      diagramType: "flowchart",
      nodes: [{ id: "n1", label: "Step 1" }],
    };
    const assignments = layoutProcessRail({ region, processBlock: block });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].frame).toEqual(region);
  });
});

describe("layoutSidecarStack", () => {
  it("returns empty for 0 blocks", () => {
    expect(layoutSidecarStack({ region: makeRegion(), blocks: [] })).toHaveLength(0);
  });

  it.each([1, 2, 3])("stacks %d blocks vertically without overlap", (count) => {
    const region = makeRegion();
    const assignments = layoutSidecarStack({ region, blocks: makeCalloutBlocks(count) });
    expect(assignments).toHaveLength(count);
    expect(noOverlaps(assignments)).toBe(true);
  });
});

describe("no primitive returns duplicate frames", () => {
  it("metricRail frames are unique", () => {
    const assignments = layoutMetricRail({
      region: makeRegion(),
      blocks: makeMetricBlocks(4),
    });
    const frameKeys = assignments.map(
      (a) => `${a.frame.x},${a.frame.y},${a.frame.width},${a.frame.height}`,
    );
    expect(new Set(frameKeys).size).toBe(frameKeys.length);
  });

  it("cardGrid frames are unique", () => {
    const assignments = layoutCardGrid({
      region: makeRegion(),
      blocks: makeCalloutBlocks(4),
    });
    const frameKeys = assignments.map(
      (a) => `${a.frame.x},${a.frame.y},${a.frame.width},${a.frame.height}`,
    );
    expect(new Set(frameKeys).size).toBe(frameKeys.length);
  });
});

import { describe, expect, it } from "vitest";

import {
  createApprovalItemFrames,
  createMetricRail,
  createSmallMultiplesGrid,
  createTwoByTwoCards,
} from "#src/builders/layouts/grid-utils.js";
import type { ResolvedFrame } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function framesOverlap(a: ResolvedFrame, b: ResolvedFrame): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function isWithinBounds(frame: ResolvedFrame, bounds: ResolvedFrame): boolean {
  return (
    frame.x >= bounds.x &&
    frame.y >= bounds.y &&
    frame.x + frame.width <= bounds.x + bounds.width &&
    frame.y + frame.height <= bounds.y + bounds.height
  );
}

// Standard metric region from dashboard-cards template
const METRICS_REGION: ResolvedFrame = { x: 80, y: 160, width: 1120, height: 140 };
// Standard visual region
const VISUAL_REGION: ResolvedFrame = { x: 80, y: 160, width: 1120, height: 300 };
// Standard main region for approval layout
const MAIN_REGION: ResolvedFrame = { x: 80, y: 260, width: 560, height: 300 };
// Approval metrics region
const APPROVAL_METRICS: ResolvedFrame = { x: 680, y: 260, width: 520, height: 160 };

// ---------------------------------------------------------------------------
// createMetricRail
// ---------------------------------------------------------------------------

describe("createMetricRail", () => {
  it("places 4 metrics in a single horizontal row", () => {
    const frames = createMetricRail(METRICS_REGION, 4, { gap: 20 });
    expect(frames).toHaveLength(4);
    // All same y
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
  });

  it("4 metric frames do not overlap", () => {
    const frames = createMetricRail(METRICS_REGION, 4, { gap: 20 });
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });

  it("4 metric frames stay within bounds", () => {
    const frames = createMetricRail(METRICS_REGION, 4, { gap: 20 });
    for (const f of frames) {
      expect(f.x + f.width).toBeLessThanOrEqual(METRICS_REGION.x + METRICS_REGION.width);
    }
  });

  it("3 metrics are also horizontal", () => {
    const frames = createMetricRail(METRICS_REGION, 3, { gap: 20 });
    expect(frames).toHaveLength(3);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
  });

  it("2 metrics in approval sidecar are horizontal", () => {
    const frames = createMetricRail(APPROVAL_METRICS, 2, {
      minCardHeight: 60,
      maxCardHeight: 160,
      gap: 16,
    });
    expect(frames).toHaveLength(2);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
    expect(framesOverlap(frames[0]!, frames[1]!)).toBe(false);
  });

  it("5 metrics fall back to 2-row grid", () => {
    const frames = createMetricRail(METRICS_REGION, 5, { gap: 20 });
    expect(frames).toHaveLength(5);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(2);
  });

  it("returns empty array for count 0", () => {
    expect(createMetricRail(METRICS_REGION, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createSmallMultiplesGrid
// ---------------------------------------------------------------------------

describe("createSmallMultiplesGrid", () => {
  it("3 charts are placed in a single row", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 3);
    expect(frames).toHaveLength(3);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
  });

  it("3 chart frames do not overlap", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 3);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });

  it("3 chart frames stay within visual region", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 3);
    for (const f of frames) {
      expect(isWithinBounds(f, VISUAL_REGION)).toBe(true);
    }
  });

  it("each chart is at least 280px wide", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 3);
    for (const f of frames) {
      expect(f.width).toBeGreaterThanOrEqual(280);
    }
  });

  it("2 charts are placed in 2 columns", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 2);
    expect(frames).toHaveLength(2);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
  });

  it("4 charts are placed in 2×2 grid", () => {
    const frames = createSmallMultiplesGrid(VISUAL_REGION, 4);
    expect(frames).toHaveLength(4);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createTwoByTwoCards
// ---------------------------------------------------------------------------

describe("createTwoByTwoCards", () => {
  it("4 items are placed in 2×2 grid", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 4);
    expect(frames).toHaveLength(4);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(2);
  });

  it("4 card frames do not overlap", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 4);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });

  it("3 items are placed in 2×2 grid", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 3);
    expect(frames).toHaveLength(4); // splitGrid produces 2×2=4 frames
  });

  it("2 items are placed horizontally", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 2);
    expect(frames).toHaveLength(2);
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(1);
  });

  it("1 item returns single frame", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 1);
    expect(frames).toHaveLength(1);
  });

  it("5 items use 2-col × 3-row grid", () => {
    const frames = createTwoByTwoCards(MAIN_REGION, 5);
    expect(frames).toHaveLength(6); // 2×3 grid
    const ys = new Set(frames.map((f) => f.y));
    expect(ys.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// createApprovalItemFrames  (Phase 7.7-fix2)
// ---------------------------------------------------------------------------

describe("createApprovalItemFrames", () => {
  const region: ResolvedFrame = { x: 80, y: 260, width: 560, height: 300 };

  it("returns 1 frame for 1 item", () => {
    const frames = createApprovalItemFrames(region, 1);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(region);
  });

  it("returns 2 non-overlapping vertical frames for 2 items", () => {
    const frames = createApprovalItemFrames(region, 2);
    expect(frames).toHaveLength(2);
    expect(framesOverlap(frames[0]!, frames[1]!)).toBe(false);
  });

  it("returns 4 non-overlapping frames for 4 items (2x2 for wide region)", () => {
    const frames = createApprovalItemFrames(region, 4);
    expect(frames).toHaveLength(4);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });

  it("returns 4 non-overlapping frames for narrow region", () => {
    const narrow: ResolvedFrame = { x: 80, y: 260, width: 300, height: 300 };
    const frames = createApprovalItemFrames(narrow, 4);
    expect(frames).toHaveLength(4);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });

  it("returns 5 non-overlapping frames for 5 items", () => {
    const frames = createApprovalItemFrames(region, 5);
    expect(frames).toHaveLength(5);
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        expect(framesOverlap(frames[i]!, frames[j]!)).toBe(false);
      }
    }
  });
});

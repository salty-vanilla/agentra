import { describe, expect, it } from "vitest";

import {
  clampFrameToSlide,
  findDuplicateFrameGroups,
  frameOverlapRatio,
  framesEqual,
  isFrameOutOfBounds,
  stackFramesVertically,
} from "#src/geometry/frame-geometry.js";

const SLIDE = { width: 1280, height: 720, unit: "px" as const };

describe("frame-geometry helpers", () => {
  describe("frameOverlapRatio", () => {
    it("returns 0 when frames don't intersect", () => {
      expect(
        frameOverlapRatio(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 200, y: 200, width: 100, height: 100 },
        ),
      ).toBe(0);
    });

    it("returns 1 when one frame contains the other", () => {
      expect(
        frameOverlapRatio(
          { x: 0, y: 0, width: 200, height: 200 },
          { x: 50, y: 50, width: 50, height: 50 },
        ),
      ).toBe(1);
    });

    it("normalizes by smaller frame area", () => {
      // 100x100 small frame, half overlap -> 0.5
      const ratio = frameOverlapRatio(
        { x: 0, y: 0, width: 200, height: 100 },
        { x: 100, y: 0, width: 100, height: 100 },
      );
      expect(ratio).toBeCloseTo(1, 5);
    });
  });

  describe("framesEqual", () => {
    it("treats frames within epsilon as equal", () => {
      expect(
        framesEqual(
          { x: 10, y: 10, width: 100, height: 50 },
          { x: 10.3, y: 10, width: 100, height: 50 },
        ),
      ).toBe(true);
    });
    it("rejects clearly different frames", () => {
      expect(
        framesEqual(
          { x: 10, y: 10, width: 100, height: 50 },
          { x: 10, y: 80, width: 100, height: 50 },
        ),
      ).toBe(false);
    });
  });

  describe("isFrameOutOfBounds / clampFrameToSlide", () => {
    it("flags negative origins", () => {
      expect(
        isFrameOutOfBounds({ x: -10, y: 5, width: 100, height: 100 }, SLIDE),
      ).toBe(true);
    });

    it("flags frames extending past the right/bottom edge", () => {
      expect(
        isFrameOutOfBounds({ x: 1200, y: 600, width: 200, height: 200 }, SLIDE),
      ).toBe(true);
    });

    it("clamps origin into bounds", () => {
      const clamped = clampFrameToSlide(
        { x: -50, y: -50, width: 200, height: 200 },
        SLIDE,
      );
      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(0);
      expect(clamped.width).toBe(200);
      expect(clamped.height).toBe(200);
    });

    it("shrinks oversize frames before re-positioning", () => {
      const clamped = clampFrameToSlide(
        { x: 0, y: 0, width: 5000, height: 5000 },
        SLIDE,
      );
      expect(clamped.x + clamped.width).toBeLessThanOrEqual(SLIDE.width);
      expect(clamped.y + clamped.height).toBeLessThanOrEqual(SLIDE.height);
    });
  });

  describe("stackFramesVertically", () => {
    const region = { x: 80, y: 200, width: 1120, height: 400 };

    it("returns a single full-region frame for count=1", () => {
      const [only] = stackFramesVertically(region, 1);
      expect(only).toEqual(region);
    });

    it("distributes 3 elements with gaps inside the region", () => {
      const stacked = stackFramesVertically(region, 3, 12);
      expect(stacked).toHaveLength(3);
      // No two frames identical.
      const serialized = new Set(stacked.map((f) => `${f.x},${f.y},${f.width},${f.height}`));
      expect(serialized.size).toBe(3);
      // All inside region.
      for (const f of stacked) {
        expect(f.x).toBe(region.x);
        expect(f.width).toBe(region.width);
        expect(f.y).toBeGreaterThanOrEqual(region.y);
        expect(f.y + f.height).toBeLessThanOrEqual(region.y + region.height);
      }
      // Stacked top-to-bottom.
      expect(stacked[0]!.y).toBeLessThan(stacked[1]!.y);
      expect(stacked[1]!.y).toBeLessThan(stacked[2]!.y);
    });

    it("returns empty for non-positive count", () => {
      expect(stackFramesVertically(region, 0)).toEqual([]);
    });
  });

  describe("findDuplicateFrameGroups", () => {
    it("groups identical frames", () => {
      const groups = findDuplicateFrameGroups([
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toEqual([0, 1, 3]);
    });

    it("returns no groups when frames are unique", () => {
      const groups = findDuplicateFrameGroups([
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 10, y: 10, width: 100, height: 100 },
      ]);
      expect(groups).toEqual([]);
    });
  });
});

import { describe, expect, it } from "vitest";

import { defaultFrameForRole } from "#src/operations/utils.js";

const SLIDE = { width: 1280, height: 720, unit: "px" as const };

describe("defaultFrameForRole (deck-forge core 0.2.2 Bug B)", () => {
  it("places title at top-left without spanning the full content area", () => {
    const f = defaultFrameForRole("title", SLIDE);
    expect(f).toEqual({ x: 80, y: 80, width: 1120, height: 112 });
  });

  it("places footer at the bottom strip", () => {
    const f = defaultFrameForRole("footer", SLIDE);
    expect(f.x).toBe(80);
    expect(f.width).toBe(1120);
    expect(f.height).toBe(40);
    expect(f.y + f.height).toBe(SLIDE.height - 80);
  });

  it("body, visual, callout, sidebar, footer regions do not all collapse to the same frame", () => {
    const roles = ["body", "visual", "callout", "sidebar", "footer", "title"] as const;
    const frames = roles.map((role) => defaultFrameForRole(role, SLIDE));
    const serialized = new Set(frames.map((f) => `${f.x},${f.y},${f.width},${f.height}`));
    // All 6 roles must occupy distinct frames (regression: prior to 0.2.2 every
    // non-title/footer role returned the identical {80,80,1120,560} rectangle).
    expect(serialized.size).toBe(roles.length);
  });

  it("body and visual do not horizontally overlap (split left 60% / right 40%)", () => {
    const body = defaultFrameForRole("body", SLIDE);
    const visual = defaultFrameForRole("visual", SLIDE);
    expect(body.x + body.width).toBeLessThanOrEqual(visual.x);
    // Same vertical band.
    expect(body.y).toBe(visual.y);
    expect(body.height).toBe(visual.height);
  });

  it("body and callout do not vertically overlap (callout sits below body)", () => {
    const body = defaultFrameForRole("body", SLIDE);
    const callout = defaultFrameForRole("callout", SLIDE);
    expect(body.y + body.height).toBeLessThanOrEqual(callout.y);
  });

  it("body and title do not vertically overlap", () => {
    const title = defaultFrameForRole("title", SLIDE);
    const body = defaultFrameForRole("body", SLIDE);
    expect(title.y + title.height).toBeLessThanOrEqual(body.y);
  });

  it("everything stays inside the slide bounds with the default 80px padding", () => {
    const roles = ["title", "body", "visual", "callout", "sidebar", "footer"] as const;
    for (const role of roles) {
      const f = defaultFrameForRole(role, SLIDE);
      expect(f.x).toBeGreaterThanOrEqual(80);
      expect(f.y).toBeGreaterThanOrEqual(80);
      expect(f.x + f.width).toBeLessThanOrEqual(SLIDE.width - 80);
      expect(f.y + f.height).toBeLessThanOrEqual(SLIDE.height - 80);
    }
  });
});

import { describe, expect, it } from "vitest";

import type { ResolvedFrame } from "#src/index.js";
import type { TemplateSlotName } from "#src/templates/template-profile.js";
import type { LayoutContext } from "#src/builders/layouts/types.js";
import {
  assignmentFromSlot,
  mergeFallbackSlots,
  resolveSlotFrame,
} from "#src/builders/layouts/slot-utils.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const frame = (x: number, y: number, w: number, h: number): ResolvedFrame => ({
  x,
  y,
  width: w,
  height: h,
});

function makeCtx(
  slots: Partial<Record<TemplateSlotName, ResolvedFrame>>,
): LayoutContext {
  return {
    templateSlots: slots,
    // remaining fields are unused by slot-utils, stub them out
    slideSpec: {} as never,
    layoutSpec: {} as never,
    regions: [],
    theme: {} as never,
    slideSize: { width: 1280, height: 720, unit: "px" },
    blocks: [],
    regionFrames: {
      body: frame(0, 0, 100, 100),
      visual: frame(0, 0, 100, 100),
      callout: frame(0, 0, 100, 100),
      table: frame(0, 0, 100, 100),
    },
    templateProfile: {} as never,
    templateLayout: {} as never,
  };
}

const fallback = frame(0, 0, 1280, 720);

// ---------------------------------------------------------------------------
// resolveSlotFrame
// ---------------------------------------------------------------------------

describe("resolveSlotFrame", () => {
  it("uses single preferred slot when present", () => {
    const ctx = makeCtx({ metrics: frame(10, 10, 200, 100) });
    const result = resolveSlotFrame(ctx, "metrics", fallback);
    expect(result.slot).toBe("metrics");
    expect(result.frame).toEqual(frame(10, 10, 200, 100));
    expect(result.fallbackSlots).toEqual([]);
  });

  it("uses first available slot from array", () => {
    const ctx = makeCtx({ cards: frame(20, 20, 300, 150) });
    const result = resolveSlotFrame(ctx, ["metrics", "cards"], fallback);
    expect(result.slot).toBe("cards");
    expect(result.frame).toEqual(frame(20, 20, 300, 150));
    expect(result.fallbackSlots).toEqual([]);
  });

  it("prefers earlier slot when multiple exist", () => {
    const ctx = makeCtx({
      metrics: frame(10, 10, 200, 100),
      cards: frame(20, 20, 300, 150),
    });
    const result = resolveSlotFrame(ctx, ["metrics", "cards"], fallback);
    expect(result.slot).toBe("metrics");
    expect(result.frame).toEqual(frame(10, 10, 200, 100));
  });

  it("falls back when all preferred slots are missing", () => {
    const ctx = makeCtx({});
    const result = resolveSlotFrame(ctx, ["metrics", "cards"], fallback);
    expect(result.slot).toBeUndefined();
    expect(result.frame).toEqual(fallback);
    expect(result.fallbackSlots).toEqual(["metrics", "cards"]);
  });

  it("falls back for single missing slot", () => {
    const ctx = makeCtx({});
    const result = resolveSlotFrame(ctx, "visual", fallback);
    expect(result.slot).toBeUndefined();
    expect(result.frame).toEqual(fallback);
    expect(result.fallbackSlots).toEqual(["visual"]);
  });
});

// ---------------------------------------------------------------------------
// assignmentFromSlot
// ---------------------------------------------------------------------------

describe("assignmentFromSlot", () => {
  it("preserves slot and fallbackSlots from resolution", () => {
    const resolution = {
      frame: frame(10, 10, 200, 100),
      slot: "metrics" as TemplateSlotName,
      fallbackSlots: [] as TemplateSlotName[],
    };
    const assignment = assignmentFromSlot({
      blockId: "m1",
      resolution,
      hints: { decoration: "card" },
    });
    expect(assignment.blockId).toBe("m1");
    expect(assignment.slot).toBe("metrics");
    expect(assignment.fallbackSlots).toBeUndefined();
    expect(assignment.frame).toEqual(frame(10, 10, 200, 100));
    expect(assignment.hints).toEqual({ decoration: "card" });
  });

  it("uses override frame when provided", () => {
    const resolution = {
      frame: frame(10, 10, 200, 100),
      slot: "cards" as TemplateSlotName,
      fallbackSlots: [] as TemplateSlotName[],
    };
    const overrideFrame = frame(50, 50, 100, 50);
    const assignment = assignmentFromSlot({
      blockId: "m2",
      resolution,
      frame: overrideFrame,
    });
    expect(assignment.frame).toEqual(overrideFrame);
    expect(assignment.slot).toBe("cards");
  });

  it("records fallbackSlots when present", () => {
    const resolution = {
      frame: fallback,
      slot: undefined,
      fallbackSlots: ["metrics", "cards"] as TemplateSlotName[],
    };
    const assignment = assignmentFromSlot({
      blockId: "m3",
      resolution,
    });
    expect(assignment.slot).toBeUndefined();
    expect(assignment.fallbackSlots).toEqual(["metrics", "cards"]);
  });

  it("omits fallbackSlots when empty", () => {
    const resolution = {
      frame: fallback,
      slot: undefined,
      fallbackSlots: [] as TemplateSlotName[],
    };
    const assignment = assignmentFromSlot({ blockId: "m4", resolution });
    expect(assignment.fallbackSlots).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mergeFallbackSlots
// ---------------------------------------------------------------------------

describe("mergeFallbackSlots", () => {
  it("merges and deduplicates", () => {
    const result = mergeFallbackSlots(
      ["metrics", "cards"],
      ["cards", "visual"],
      undefined,
    );
    expect(result.sort()).toEqual(["cards", "metrics", "visual"]);
  });

  it("returns empty for no input", () => {
    expect(mergeFallbackSlots()).toEqual([]);
  });

  it("returns empty for all undefined", () => {
    expect(mergeFallbackSlots(undefined, undefined)).toEqual([]);
  });
});

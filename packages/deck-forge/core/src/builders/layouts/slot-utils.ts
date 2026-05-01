import type { ResolvedFrame } from "#src/index.js";
import type { TemplateSlotName } from "#src/templates/template-profile.js";
import type { LayoutContext, LayoutHints, SubFrameAssignment } from "#src/builders/layouts/types.js";

/**
 * Result of resolving a template slot with fallback tracking.
 */
export type SlotResolution = {
  /** Resolved frame — from the first matched slot or the fallback. */
  frame: ResolvedFrame;
  /** The slot name that was actually used, or undefined if fallback was used. */
  slot?: TemplateSlotName;
  /** Slot names that were attempted but missing from the template layout. */
  fallbackSlots: TemplateSlotName[];
};

/**
 * Resolve a template slot frame from a list of preferred slot names.
 *
 * Tries each slot in order; returns the first match. When no slot is found,
 * returns `fallbackFrame` and records all preferred names as `fallbackSlots`.
 */
export function resolveSlotFrame(
  ctx: LayoutContext,
  preferredSlots: TemplateSlotName | TemplateSlotName[],
  fallbackFrame: ResolvedFrame,
): SlotResolution {
  const slots = Array.isArray(preferredSlots) ? preferredSlots : [preferredSlots];
  for (const slot of slots) {
    const frame = ctx.templateSlots[slot];
    if (frame) {
      return { frame, slot, fallbackSlots: [] };
    }
  }
  return { frame: fallbackFrame, slot: undefined, fallbackSlots: [...slots] };
}

/**
 * Build a `SubFrameAssignment` from a `SlotResolution`.
 *
 * When `frame` is provided it overrides `resolution.frame` (useful when the
 * strategy subdivides the slot region into cells/grids).
 */
export function assignmentFromSlot(input: {
  blockId: string;
  resolution: SlotResolution;
  hints?: LayoutHints;
  frame?: ResolvedFrame;
}): SubFrameAssignment {
  const { blockId, resolution, hints, frame } = input;
  const assignment: SubFrameAssignment = {
    blockId,
    frame: frame ?? resolution.frame,
    hints,
  };
  if (resolution.slot) {
    assignment.slot = resolution.slot;
  }
  if (resolution.fallbackSlots.length > 0) {
    assignment.fallbackSlots = resolution.fallbackSlots;
  }
  return assignment;
}

/**
 * Merge multiple fallbackSlots arrays, deduplicating slot names.
 */
export function mergeFallbackSlots(
  ...items: Array<TemplateSlotName[] | undefined>
): TemplateSlotName[] {
  const set = new Set<TemplateSlotName>();
  for (const arr of items) {
    if (arr) {
      for (const s of arr) set.add(s);
    }
  }
  return [...set];
}

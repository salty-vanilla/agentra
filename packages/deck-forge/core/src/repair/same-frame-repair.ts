import type { PresentationIR, ResolvedFrame, OperationRecord, ElementIR } from "#src/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SameFrameRepairResult = {
  presentation: PresentationIR;
  sameFrameGroupCount: number;
  repairedElementCount: number;
  operationCount: number;
};

// ---------------------------------------------------------------------------
// Same-frame detection helpers
// ---------------------------------------------------------------------------

function frameKey(f: ResolvedFrame): string {
  return `${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.width)},${Math.round(f.height)}`;
}

function framesMatch(a: ResolvedFrame, b: ResolvedFrame, tolerance = 2): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.width - b.width) < tolerance &&
    Math.abs(a.height - b.height) < tolerance
  );
}

// ---------------------------------------------------------------------------
// Repair logic
// ---------------------------------------------------------------------------

/**
 * Detect groups of elements sharing the same frame within a slide and
 * redistribute them vertically (or in a grid) so they no longer overlap.
 *
 * This is a deterministic, LLM-free repair pass intended to run after
 * `buildPresentationIr()` and before the VLM design-review loop.
 */
export function repairSameFrameOverlaps(
  presentation: PresentationIR,
): SameFrameRepairResult {
  let totalGroups = 0;
  let totalRepaired = 0;
  const operations: OperationRecord[] = [];

  const repairedSlides = presentation.slides.map((slide) => {
    // Group elements by frame key
    const groups = new Map<string, { element: ElementIR; index: number }[]>();
    for (let i = 0; i < slide.elements.length; i++) {
      const el = slide.elements[i]!;
      const key = frameKey(el.frame);
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push({ element: el, index: i });
    }

    // Find groups with 2+ elements (same-frame overlaps)
    const overlapGroups = [...groups.values()].filter((g) => g.length >= 2);
    if (overlapGroups.length === 0) return slide;

    totalGroups += overlapGroups.length;

    // Clone elements for mutation
    const newElements = [...slide.elements];

    for (const group of overlapGroups) {
      const count = group.length;
      const baseFrame = group[0]!.element.frame;
      const gap = 8;

      // Distribute vertically within the shared frame
      const totalGap = gap * (count - 1);
      const itemHeight = Math.max(
        30,
        Math.floor((baseFrame.height - totalGap) / count),
      );

      for (let i = 0; i < count; i++) {
        const entry = group[i]!;
        const newFrame: ResolvedFrame = {
          x: baseFrame.x,
          y: baseFrame.y + i * (itemHeight + gap),
          width: baseFrame.width,
          height: itemHeight,
        };

        // Create new element with updated frame
        newElements[entry.index] = {
          ...entry.element,
          frame: newFrame,
        } as ElementIR;

        totalRepaired++;

        operations.push({
          id: `sfr-${slide.id}-${entry.element.id}`,
          timestamp: new Date().toISOString(),
          actor: "system",
          operation: {
            type: "set_element_frame",
            slideId: slide.id,
            elementId: entry.element.id,
            source: "deterministic-v1-repair",
            reason: "same_frame_overlap",
            frame: newFrame,
          },
          result: "success",
        });
      }
    }

    return { ...slide, elements: newElements };
  });

  return {
    presentation: {
      ...presentation,
      slides: repairedSlides,
      operationLog: [...presentation.operationLog, ...operations],
    },
    sameFrameGroupCount: totalGroups,
    repairedElementCount: totalRepaired,
    operationCount: operations.length,
  };
}

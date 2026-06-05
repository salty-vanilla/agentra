import { describe, expect, it } from 'vitest';
import {
  ANIM_DRAW_MS,
  ANIM_STAGGER_MS,
  animTotalMs,
  changedAnimBoxes,
} from '@/lib/deck-anim';
import type { ComposeData } from '@/lib/deck-preview';

function compose(
  components: Array<{
    changed: boolean;
    bbox: { x: number; y: number; w: number; h: number } | null;
  }>,
): ComposeData {
  return {
    version: 1,
    viewBox: '0 0 1000 500',
    bgFill: '#000',
    bgSvg: null,
    components: components.map((c, i) => ({
      class: 'c',
      bbox: c.bbox,
      text: `t${i}`,
      svg: '<rect/>',
      changed: c.changed,
    })),
  };
}

describe('changedAnimBoxes', () => {
  it('animates every component with a bbox on first appearance', () => {
    const boxes = changedAnimBoxes(
      compose([
        { changed: false, bbox: { x: 0, y: 0, w: 500, h: 250 } },
        { changed: false, bbox: { x: 500, y: 250, w: 500, h: 250 } },
      ]),
      true,
    );
    expect(boxes.map((b) => b.index)).toEqual([0, 1]);
    // Percentages relative to the 1000x500 viewBox.
    expect(boxes[0]).toMatchObject({
      leftPct: 0,
      topPct: 0,
      widthPct: 50,
      heightPct: 50,
    });
    expect(boxes[1]).toMatchObject({ leftPct: 50, topPct: 50, cxPct: 75, cyPct: 75 });
  });

  it('animates only the changed components on a later update', () => {
    const boxes = changedAnimBoxes(
      compose([
        { changed: false, bbox: { x: 0, y: 0, w: 100, h: 100 } },
        { changed: true, bbox: { x: 200, y: 200, w: 100, h: 100 } },
      ]),
      false,
    );
    expect(boxes.map((b) => b.index)).toEqual([1]);
  });

  it('skips components without a bbox', () => {
    const boxes = changedAnimBoxes(
      compose([
        { changed: true, bbox: null },
        { changed: true, bbox: { x: 0, y: 0, w: 10, h: 10 } },
      ]),
      false,
    );
    expect(boxes.map((b) => b.index)).toEqual([1]);
  });

  it('returns no boxes for a degenerate viewBox', () => {
    const c = compose([{ changed: true, bbox: { x: 0, y: 0, w: 1, h: 1 } }]);
    expect(changedAnimBoxes({ ...c, viewBox: '0 0 0 0' }, true)).toEqual([]);
  });
});

describe('animTotalMs', () => {
  it('is the draw duration for one box and adds a stagger per extra box', () => {
    expect(animTotalMs(0)).toBe(0);
    expect(animTotalMs(1)).toBe(ANIM_DRAW_MS);
    expect(animTotalMs(3)).toBe(2 * ANIM_STAGGER_MS + ANIM_DRAW_MS);
  });
});

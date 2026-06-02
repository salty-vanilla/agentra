import { describe, expect, it } from 'vitest';
import {
  buildSlideInnerSvg,
  type ComposeData,
  isComposeData,
  isDefsData,
} from '@/lib/deck-preview';

const compose: ComposeData = {
  version: 1,
  viewBox: '0 0 33867 19050',
  bgFill: '#232F3E',
  bgSvg: null,
  components: [
    {
      class: 'TitleText',
      bbox: null,
      text: 'Hello',
      svg: '<text>Hello</text>',
      changed: false,
    },
    {
      class: 'Graphic',
      bbox: null,
      text: '',
      svg: '<image href="x.webp"/>',
      changed: false,
    },
  ],
};

describe('buildSlideInnerSvg', () => {
  it('emits a solid background rect from viewBox + bgFill when bgSvg is null', () => {
    const svg = buildSlideInnerSvg('<defs/>', compose);
    expect(svg).toContain('<rect width="33867" height="19050" fill="#232F3E"/>');
  });

  it('uses bgSvg when present instead of a solid rect', () => {
    const svg = buildSlideInnerSvg('<defs/>', { ...compose, bgSvg: '<g class="bg"/>' });
    expect(svg).toContain('<g class="bg"/>');
    expect(svg).not.toContain('<rect');
  });

  it('includes the shared defs and every component group in order', () => {
    const svg = buildSlideInnerSvg('<defs id="d"/>', compose);
    expect(svg).toContain('<defs id="d"/>');
    expect(svg.indexOf('Hello')).toBeLessThan(svg.indexOf('x.webp'));
  });
});

describe('compose/defs type guards', () => {
  it('accepts valid shapes and rejects malformed ones', () => {
    expect(isComposeData(compose)).toBe(true);
    expect(isComposeData({ viewBox: '0 0 1 1' })).toBe(false);
    expect(isDefsData({ defs: '<defs/>' })).toBe(true);
    expect(isDefsData({})).toBe(false);
    expect(isDefsData(null)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  COMPOSE_VERSION,
  type ComposeData,
  type DeckResult,
  type DeckSlideManifest,
  type DefsData,
} from '../types.js';

describe('deck types', () => {
  it('COMPOSE_VERSION is the literal 1', () => {
    expect(COMPOSE_VERSION).toBe(1);
  });

  it('ComposeData matches the SDPM compose contract (version/viewBox/bgFill/bgSvg/components)', () => {
    const compose: ComposeData = {
      version: COMPOSE_VERSION,
      viewBox: '0 0 33867 19050',
      bgFill: '#232F3E',
      bgSvg: '<g class="Background"/>',
      components: [
        {
          class: 'com.sun.star.drawing.CustomShape',
          bbox: { x: 1000, y: 500, w: 20000, h: 3000 },
          text: 'Hello Title',
          svg: '<g/>',
          changed: false,
        },
      ],
    };

    expect(compose.components[0]?.changed).toBe(false);
    expect(compose.components[0]?.bbox).toEqual({ x: 1000, y: 500, w: 20000, h: 3000 });
  });

  it('allows null bbox and null bgSvg (LibreOffice fallback cases from spike #383)', () => {
    const compose: ComposeData = {
      version: COMPOSE_VERSION,
      viewBox: '0 0 33867 19050',
      bgFill: '#000',
      bgSvg: null,
      components: [
        { class: 'Graphic', bbox: null, text: '', svg: '<g/>', changed: false },
      ],
    };

    expect(compose.bgSvg).toBeNull();
    expect(compose.components[0]?.bbox).toBeNull();
  });

  it('DefsData carries versioned, stringified defs', () => {
    const defs: DefsData = { version: COMPOSE_VERSION, defs: '<defs/>' };
    expect(defs.version).toBe(1);
    expect(typeof defs.defs).toBe('string');
  });

  it('DeckSlideManifest is a lightweight manifest (no semantic spec fields)', () => {
    const manifest: DeckSlideManifest = {
      slug: 'intro',
      index: 1,
      title: null,
      previewKey: 'decks/d1/preview/intro.webp',
      composeKey: 'decks/d1/slides/intro.compose.json',
    };
    // Lightweight: carries S3 keys + ordering, not semantic slide content.
    expect(manifest.previewKey).toContain('preview/');
    expect(manifest.composeKey).toContain('.compose.json');
    expect(manifest.index).toBe(1);
    expect(manifest.title).toBeNull();
  });

  it('DeckResult aligns with SDPM deckService DeckDetail shape', () => {
    const deck: DeckResult = {
      deckId: '01J000000000000000000000000',
      name: 'AgentCore 入門',
      language: 'ja',
      slideOrder: ['intro', 'problem'],
      defsUrl: 'https://example/defs.json?sig',
      pptxDownloadUrl: 'https://example/deck.pptx?sig',
      specs: {
        brief: null,
        outline: 'https://example/outline.md?sig',
        artDirection: null,
      },
      slides: [
        { slug: 'intro', previewUrl: 'https://example/intro.webp?sig', composeUrl: null },
      ],
      version: COMPOSE_VERSION,
    };

    expect(deck.slideOrder).toHaveLength(2);
    expect(deck.slides[0]?.composeUrl).toBeNull();
    expect(deck.specs.outline).toContain('outline.md');
  });
});

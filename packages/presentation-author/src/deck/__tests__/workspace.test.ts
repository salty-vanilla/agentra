import { describe, expect, it } from 'vitest';
import {
  buildDeckWorkspace,
  type DeckComposeArtifacts,
  type DeckMeta,
} from '../workspace.js';

const meta: DeckMeta = { deckId: 'deck-1', name: 'Demo', language: 'ja' };

const compose: DeckComposeArtifacts = {
  defsPath: '/tmp/out/defs.json',
  pptxPath: '/tmp/out/deck.pptx',
  pptxEpoch: 1700000000000,
  slides: [
    {
      slug: 'intro',
      index: 1,
      composePath: '/tmp/out/intro.compose.json',
      previewPath: '/tmp/out/intro.webp',
    },
    { slug: 'body', index: 2, composePath: '/tmp/out/body.compose.json' },
  ],
};

describe('buildDeckWorkspace', () => {
  it('derives slideOrder from compose slide order', () => {
    const ws = buildDeckWorkspace(meta, compose);
    expect(ws.slideOrder).toEqual(['intro', 'body']);
  });

  it('uses the decks/<id>/... prefix for all keys', () => {
    const ws = buildDeckWorkspace(meta, compose);
    for (const item of ws.items) {
      expect(item.key.startsWith('decks/deck-1/')).toBe(true);
    }
  });

  it('places defs, compose, preview, pptx, deck.json and outline at the documented keys', () => {
    const ws = buildDeckWorkspace(meta, compose);
    const byRole = Object.fromEntries(
      ws.items.map((i) => [`${i.role}:${i.slug ?? ''}`, i.key]),
    );
    expect(byRole['deck-json:']).toBe('decks/deck-1/deck.json');
    expect(byRole['spec-outline:']).toBe('decks/deck-1/specs/outline.md');
    expect(byRole['defs:']).toBe('decks/deck-1/preview/defs.json');
    expect(byRole['compose:intro']).toBe('decks/deck-1/slides/intro.compose.json');
    expect(byRole['preview:intro']).toBe('decks/deck-1/preview/intro.webp');
    expect(byRole['pptx:']).toBe('decks/deck-1/pptx/1700000000000.pptx');
  });

  it('omits the preview item for slides without a previewPath', () => {
    const ws = buildDeckWorkspace(meta, compose);
    const previews = ws.items.filter((i) => i.role === 'preview');
    expect(previews).toHaveLength(1); // only 'intro' has a preview
  });

  it('produces lightweight slide manifests (slug/index/keys, title null)', () => {
    const ws = buildDeckWorkspace(meta, compose);
    expect(ws.manifests).toEqual([
      {
        slug: 'intro',
        index: 1,
        title: null,
        previewKey: 'decks/deck-1/preview/intro.webp',
        composeKey: 'decks/deck-1/slides/intro.compose.json',
      },
      {
        slug: 'body',
        index: 2,
        title: null,
        previewKey: 'decks/deck-1/preview/body.webp',
        composeKey: 'decks/deck-1/slides/body.compose.json',
      },
    ]);
  });

  it('writes outline.md in slide order and inline deck.json metadata', () => {
    const ws = buildDeckWorkspace(meta, compose);
    const outline = ws.items.find((i) => i.role === 'spec-outline');
    const deckJson = ws.items.find((i) => i.role === 'deck-json');
    expect(outline?.source).toEqual({ kind: 'inline', body: '- [intro]\n- [body]\n' });
    if (deckJson?.source.kind !== 'inline') throw new Error('deck.json must be inline');
    expect(JSON.parse(deckJson.source.body)).toMatchObject({
      name: 'Demo',
      language: 'ja',
    });
  });

  it('omits the pptx key when no pptxPath is provided', () => {
    const ws = buildDeckWorkspace(meta, { ...compose, pptxPath: undefined });
    expect(ws.keys.pptx).toBeNull();
    expect(ws.items.some((i) => i.role === 'pptx')).toBe(false);
  });

  it('rejects unsafe slugs/deckId that could escape the key namespace', () => {
    expect(() =>
      buildDeckWorkspace(meta, {
        ...compose,
        slides: [{ slug: '../etc', index: 1, composePath: '/tmp/x.json' }],
      }),
    ).toThrow(/Unsafe slug/);
    expect(() => buildDeckWorkspace({ ...meta, deckId: 'a/b' }, compose)).toThrow(
      /Unsafe deckId/,
    );
  });
});

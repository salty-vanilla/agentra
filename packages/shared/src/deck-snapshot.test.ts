import { describe, expect, it } from 'vitest';
import {
  type DeckSnapshotDeps,
  getDeckSnapshot,
  parseDeckKeys,
  parseOutlineEntries,
} from './deck-snapshot.js';

const DECK = 'deck-1';
const k = (rel: string) => `decks/${DECK}/${rel}`;

describe('parseDeckKeys', () => {
  it('groups slides by slug and picks the latest epoch per slide', () => {
    const parsed = parseDeckKeys(DECK, [
      k('deck.json'),
      k('preview/defs.100.json'),
      k('preview/defs.200.json'),
      k('slides/slide-1.100.compose.json'),
      k('slides/slide-1.300.compose.json'), // newer epoch wins for slide 1
      k('slides/slide-2.200.compose.json'),
      k('preview/slide-1.webp'),
    ]);

    expect(parsed.deckJsonKey).toBe(k('deck.json'));
    expect(parsed.defsKey).toBe(k('preview/defs.200.json'));
    expect(parsed.defsEpoch).toBe(200);
    expect(parsed.slides.map((s) => s.slug)).toEqual(['slide-1', 'slide-2']);

    const s1 = parsed.slides[0]!;
    expect(s1.index).toBe(1);
    expect(s1.epoch).toBe(300);
    expect(s1.composeKey).toBe(k('slides/slide-1.300.compose.json'));
    expect(s1.previewKey).toBe(k('preview/slide-1.webp'));

    // Overall deck epoch = max across slides + defs.
    expect(parsed.epoch).toBe(300);
  });

  it('orders slides by their numeric index, not lexically', () => {
    const parsed = parseDeckKeys(DECK, [
      k('slides/slide-10.1.compose.json'),
      k('slides/slide-2.1.compose.json'),
      k('slides/slide-1.1.compose.json'),
    ]);
    expect(parsed.slides.map((s) => s.slug)).toEqual(['slide-1', 'slide-2', 'slide-10']);
    expect(parsed.slideOrder).toEqual(['slide-1', 'slide-2', 'slide-10']);
  });

  it('handles the batch layout (no epoch in the key) as epoch 0', () => {
    const parsed = parseDeckKeys(DECK, [
      k('preview/defs.json'),
      k('slides/slide-1.compose.json'),
    ]);
    expect(parsed.defsKey).toBe(k('preview/defs.json'));
    expect(parsed.defsEpoch).toBe(0);
    expect(parsed.slides[0]?.epoch).toBe(0);
    expect(parsed.slides[0]?.composeKey).toBe(k('slides/slide-1.compose.json'));
  });

  it('returns an empty projection when there are no deck keys', () => {
    const parsed = parseDeckKeys(DECK, []);
    expect(parsed.slides).toEqual([]);
    expect(parsed.defsKey).toBeNull();
    expect(parsed.epoch).toBe(0);
  });

  it('ignores unrelated / malformed keys', () => {
    const parsed = parseDeckKeys(DECK, [
      k('slides/slide-1.1.compose.json'),
      k('pptx/123.pptx'),
      k('specs/outline.md'),
      'decks/other-deck/slides/slide-1.1.compose.json', // different deck
      k('slides/not-a-slide.txt'),
    ]);
    expect(parsed.slides.map((s) => s.slug)).toEqual(['slide-1']);
  });
});

describe('getDeckSnapshot', () => {
  function deps(keys: string[], meta: Record<string, unknown> = {}): DeckSnapshotDeps {
    return {
      listKeys: async () => keys,
      readJson: async () => meta,
      presign: async (key) => `https://cdn/${key}?sig`,
    };
  }

  it('projects the persisted deck into an authoritative snapshot', async () => {
    const keys = [
      k('deck.json'),
      k('preview/defs.300.json'),
      k('slides/slide-1.300.compose.json'),
      k('slides/slide-2.300.compose.json'),
      k('preview/slide-1.webp'),
    ];
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      deps(keys, { name: '茶道の歴史', language: 'ja' }),
    );
    expect(snap).not.toBeNull();
    expect(snap?.name).toBe('茶道の歴史');
    expect(snap?.language).toBe('ja');
    expect(snap?.slideOrder).toEqual(['slide-1', 'slide-2']);
    expect(snap?.epoch).toBe(300);
    expect(snap?.defsUrl).toContain('defs.300.json');
    expect(snap?.slides[0]?.composeUrl).toContain('slide-1.300.compose.json');
    expect(snap?.slides[0]?.previewUrl).toContain('slide-1.webp');
    expect(snap?.slides[1]?.previewUrl).toBeNull();
  });

  it('returns null when the deck does not exist', async () => {
    const snap = await getDeckSnapshot({ deckId: DECK }, deps([]));
    expect(snap).toBeNull();
  });

  it('falls back to the deckId as name when deck.json lacks one', async () => {
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      deps([k('slides/slide-1.1.compose.json')], {}),
    );
    expect(snap?.name).toBe(DECK);
    expect(snap?.language).toBe('ja');
  });

  it('omits workspace for agentra-pptxgenjs decks (outline + compose only)', async () => {
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      deps([k('deck.json'), k('specs/outline.md'), k('slides/slide-1.1.compose.json')]),
    );
    expect(snap?.workspace).toBeUndefined();
  });
});

describe('parseOutlineEntries', () => {
  it('parses "- [slug] message" lines in order', () => {
    const entries = parseOutlineEntries(
      '- [intro] 目的を伝える\n- [summary] 行動を促す\nnot a slide line\n',
    );
    expect(entries).toEqual([
      { slug: 'intro', message: '目的を伝える' },
      { slug: 'summary', message: '行動を促す' },
    ]);
  });

  it('tolerates a slug with no message', () => {
    expect(parseOutlineEntries('- [intro]')).toEqual([{ slug: 'intro', message: '' }]);
  });
});

describe('getDeckSnapshot — SDPM workspace projection', () => {
  /** Per-key deps: JSON for slides/*.json, text for outline, presign passthrough. */
  function sdpmDeps(
    keys: string[],
    files: {
      deckJson?: Record<string, unknown>;
      outline?: string;
      slideJson?: Record<string, Record<string, unknown>>;
    } = {},
  ): DeckSnapshotDeps {
    return {
      listKeys: async () => keys,
      readJson: async (key) => {
        if (key === k('deck.json')) return files.deckJson ?? {};
        const m = key.match(/slides\/([^/]+)\.json$/);
        if (m && !key.endsWith('.compose.json')) {
          return files.slideJson?.[m[1] as string] ?? null;
        }
        return null;
      },
      readText: async (key) =>
        key === k('specs/outline.md') ? (files.outline ?? null) : null,
      presign: async (key) => `https://cdn/${key}?sig`,
    };
  }

  it('projects specs + slide skeletons from outline and slide JSON', async () => {
    const keys = [
      k('deck.json'),
      k('specs/brief.md'),
      k('specs/outline.md'),
      k('specs/art-direction.html'),
      k('slides/intro.json'),
      k('slides/summary.json'),
    ];
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      sdpmDeps(keys, {
        deckJson: { name: 'Spike', language: 'ja' },
        outline: '- [intro] 目的を伝える\n- [summary] 行動を促す\n',
        slideJson: {
          intro: { layout: 'Title Slide', placeholders: { '0': 'はじめに' } },
          summary: { layout: 'Blank', title: 'まとめ' },
        },
      }),
    );

    expect(snap?.workspace).toBeDefined();
    expect(snap?.workspace?.specs.briefUrl).toContain('specs/brief.md');
    expect(snap?.workspace?.specs.outlineUrl).toContain('specs/outline.md');
    expect(snap?.workspace?.specs.artDirectionUrl).toContain('art-direction.html');

    const wsSlides = snap?.workspace?.slides ?? [];
    expect(wsSlides.map((s) => s.slug)).toEqual(['intro', 'summary']);
    expect(wsSlides[0]).toMatchObject({
      slug: 'intro',
      index: 1,
      title: 'はじめに',
      message: '目的を伝える',
      layoutIntent: 'Title Slide',
      status: 'skeleton',
    });
    expect(wsSlides[1]).toMatchObject({
      slug: 'summary',
      index: 2,
      title: 'まとめ',
      message: '行動を促す',
      status: 'skeleton',
    });
  });

  it('marks a slide ready once its compose exists', async () => {
    const keys = [
      k('deck.json'),
      k('specs/outline.md'),
      k('slides/intro.json'),
      k('slides/summary.json'),
      k('slides/intro.300.compose.json'),
    ];
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      sdpmDeps(keys, {
        outline: '- [intro] a\n- [summary] b\n',
        slideJson: { intro: { layout: 'X' }, summary: { layout: 'Y' } },
      }),
    );
    const ws = snap?.workspace?.slides ?? [];
    expect(ws.find((s) => s.slug === 'intro')?.status).toBe('ready');
    expect(ws.find((s) => s.slug === 'summary')?.status).toBe('skeleton');
  });

  it('degrades without readText (no outline messages, still lists skeletons)', async () => {
    const keys = [k('deck.json'), k('specs/outline.md'), k('slides/intro.json')];
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      {
        listKeys: async () => keys,
        readJson: async (key) => (key.endsWith('intro.json') ? { layout: 'Z' } : {}),
        presign: async (key) => `https://cdn/${key}?sig`,
        // no readText
      },
    );
    expect(snap?.workspace?.slides).toEqual([
      {
        slug: 'intro',
        index: 1,
        title: null,
        message: null,
        layoutIntent: 'Z',
        visualIntent: null,
        status: 'skeleton',
      },
    ]);
  });

  it('degrades on a partial workspace (brief only, no slides)', async () => {
    const snap = await getDeckSnapshot(
      { deckId: DECK },
      sdpmDeps([k('deck.json'), k('specs/brief.md')]),
    );
    expect(snap?.workspace).toBeDefined();
    expect(snap?.workspace?.specs.briefUrl).toContain('brief.md');
    expect(snap?.workspace?.specs.outlineUrl).toBeNull();
    expect(snap?.workspace?.slides).toEqual([]);
  });
});

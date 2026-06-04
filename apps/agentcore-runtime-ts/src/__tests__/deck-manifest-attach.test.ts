import type { ArtifactManifest, DeckResult } from '@agentra/agent-tools';
import { describe, expect, it } from 'vitest';
import {
  attachDeckToManifest,
  emitDeckProgressEvents,
  parseDeckFromSlideResult,
} from '../agent.js';

const validDeck: DeckResult = {
  deckId: 'deck-1',
  name: 'Demo',
  language: 'ja',
  slideOrder: ['intro'],
  defsUrl: 'https://example.com/defs.json?sig',
  pptxDownloadUrl: null,
  specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
  slides: [{ slug: 'intro', previewUrl: null, composeUrl: 'https://example.com/c?sig' }],
  version: 1,
};

const baseManifest: ArtifactManifest = {
  id: 'm-1',
  createdAt: '2026-06-03T00:00:00Z',
  artifacts: [],
};

function slideContent(payload: unknown) {
  return [{ text: JSON.stringify(payload) }];
}

describe('parseDeckFromSlideResult', () => {
  it('extracts a valid deck from the slide tool result content', () => {
    const deck = parseDeckFromSlideResult(
      slideContent({ success: true, deck: validDeck }),
    );
    expect(deck?.deckId).toBe('deck-1');
  });

  it('returns undefined when the result has no deck', () => {
    expect(parseDeckFromSlideResult(slideContent({ success: true }))).toBeUndefined();
  });

  it('returns undefined for an invalid deck (schema mismatch)', () => {
    const bad = { ...validDeck, version: 2 };
    expect(
      parseDeckFromSlideResult(slideContent({ success: true, deck: bad })),
    ).toBeUndefined();
  });

  // Live regression (#403): the Strands SDK does not preserve the tool's
  // returned `[{ text: JSON }]` shape. It commonly surfaces the tool's *return
  // object* as a nested `{ type:'json', json:{ status, content:[{ text }] } }`,
  // burying the deck two levels deep. The parser must find it in all shapes.
  it('extracts the deck from a {type:json, json:{status,content:[{text}]}} wrapper', () => {
    const content = [
      {
        type: 'json',
        json: {
          status: 'success',
          content: [{ text: JSON.stringify({ success: true, deck: validDeck }) }],
        },
      },
    ];
    expect(parseDeckFromSlideResult(content)?.deckId).toBe('deck-1');
  });

  it('extracts the deck from a flat {json:{deck}} content block', () => {
    const content = [{ type: 'json', json: { success: true, deck: validDeck } }];
    expect(parseDeckFromSlideResult(content)?.deckId).toBe('deck-1');
  });

  it('extracts the deck from a JSON-string text content block', () => {
    expect(
      parseDeckFromSlideResult(slideContent({ success: true, deck: validDeck }))?.deckId,
    ).toBe('deck-1');
  });

  it('returns undefined for non-array / unparseable content', () => {
    expect(parseDeckFromSlideResult(null)).toBeUndefined();
    expect(parseDeckFromSlideResult([{ text: 'not json' }])).toBeUndefined();
  });
});

describe('attachDeckToManifest', () => {
  it('attaches the deck when the manifest has none', () => {
    const result = attachDeckToManifest(baseManifest, validDeck);
    expect(result.deck?.deckId).toBe('deck-1');
    // Immutable: original is untouched.
    expect(baseManifest.deck).toBeUndefined();
  });

  it('does not clobber an existing manifest deck', () => {
    const withDeck: ArtifactManifest = { ...baseManifest, deck: validDeck };
    const other = { ...validDeck, deckId: 'deck-2' };
    expect(attachDeckToManifest(withDeck, other).deck?.deckId).toBe('deck-1');
  });

  it('returns the manifest unchanged when there is no captured deck', () => {
    expect(attachDeckToManifest(baseManifest, undefined)).toBe(baseManifest);
  });
});

describe('emitDeckProgressEvents', () => {
  const multiSlideDeck: DeckResult = {
    ...validDeck,
    slideOrder: ['intro', 'body', 'close'],
    slides: [
      { slug: 'intro', previewUrl: null, composeUrl: 'https://example.com/i?sig' },
      { slug: 'body', previewUrl: null, composeUrl: 'https://example.com/b?sig' },
      { slug: 'close', previewUrl: null, composeUrl: 'https://example.com/c?sig' },
    ],
  };

  async function collect(deck: DeckResult) {
    const out: Array<{ type: string; event: { type: string } }> = [];
    // paceMs 0 + no-op sleep keeps the test deterministic and fast.
    for await (const wrapped of emitDeckProgressEvents(deck, {
      paceMs: 0,
      sleepFn: () => Promise.resolve(),
    })) {
      out.push(wrapped.data as { type: string; event: { type: string } });
    }
    return out;
  }

  it('wraps each deck preview event in a deck_progress message envelope', async () => {
    const out = await collect(multiSlideDeck);
    expect(out.every((w) => w.type === 'deck_progress')).toBe(true);
    expect(out.map((w) => w.event.type)).toEqual([
      'deck_preview_started',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_preview_completed',
    ]);
  });

  it('paces only between slide reveals', async () => {
    const slept: number[] = [];
    for await (const _ of emitDeckProgressEvents(multiSlideDeck, {
      paceMs: 50,
      sleepFn: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    })) {
      // drain
    }
    // 3 slide events → 3 paced sleeps; started/completed are not paced.
    expect(slept).toEqual([50, 50, 50]);
  });

  it('yields just started + completed for a deck with no slides', async () => {
    const out = await collect({ ...validDeck, slideOrder: [], slides: [] });
    expect(out.map((w) => w.event.type)).toEqual([
      'deck_preview_started',
      'deck_preview_completed',
    ]);
  });
});

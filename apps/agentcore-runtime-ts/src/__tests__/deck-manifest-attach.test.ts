import type { ArtifactManifest, DeckResult } from '@agentra/agent-tools';
import { describe, expect, it } from 'vitest';
import { attachDeckToManifest, parseDeckFromSlideResult } from '../agent.js';

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

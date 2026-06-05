import {
  type DeckSnapshotDeps,
  GetDeckSnapshotResponse,
  getDeckSnapshot,
} from '@agentra/shared';
import { describe, expect, it } from 'vitest';

const DECK = 'deck-1';
const k = (rel: string) => `decks/${DECK}/${rel}`;

function deps(keys: string[], meta: Record<string, unknown>): DeckSnapshotDeps {
  return {
    listKeys: async () => keys,
    readJson: async () => meta,
    presign: async (key) => `https://cdn.example.com/${key}?sig=abc`,
  };
}

describe('getDeckSnapshot ↔ GetDeckSnapshotResponse contract', () => {
  it('produces a snapshot that validates against the OpenAPI response schema', async () => {
    const snapshot = await getDeckSnapshot(
      { deckId: DECK },
      deps(
        [
          k('deck.json'),
          k('preview/defs.300.json'),
          k('slides/slide-1.300.compose.json'),
          k('slides/slide-2.300.compose.json'),
          k('preview/slide-1.webp'),
        ],
        { name: '茶道の歴史', language: 'ja' },
      ),
    );
    expect(snapshot).not.toBeNull();
    // The BFF returns this shape directly — it must satisfy the generated schema.
    expect(() => GetDeckSnapshotResponse.parse(snapshot)).not.toThrow();
  });

  it('validates a deck with no defs and a null-URL slide', async () => {
    const snapshot = await getDeckSnapshot(
      { deckId: DECK },
      {
        listKeys: async () => [k('slides/slide-1.1.compose.json')],
        readJson: async () => ({}),
        presign: async () => null,
      },
    );
    expect(GetDeckSnapshotResponse.parse(snapshot).slides[0]?.composeUrl).toBeNull();
    expect(GetDeckSnapshotResponse.parse(snapshot).defsUrl).toBeNull();
  });
});

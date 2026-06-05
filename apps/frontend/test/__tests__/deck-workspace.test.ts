import { describe, expect, it } from 'vitest';
import {
  deckSnapshotChanged,
  nextPollDelay,
  POLL_MAX_MS,
  POLL_MIN_MS,
  slideContentKey,
} from '@/lib/deck-workspace';
import type { DeckSnapshotResponse } from '@/lib/generated/model';

function snap(
  epoch: number,
  slides: Array<{ slug: string; epoch: number }>,
): DeckSnapshotResponse {
  return {
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja',
    slideOrder: slides.map((s) => s.slug),
    defsUrl: null,
    defsEpoch: epoch,
    epoch,
    slides: slides.map((s, i) => ({
      slug: s.slug,
      index: i + 1,
      epoch: s.epoch,
      composeUrl: `https://cdn/${s.slug}.${s.epoch}.json?sig=${Math.random()}`,
      previewUrl: null,
    })),
  };
}

describe('nextPollDelay', () => {
  it('snaps back to the floor when the deck changed', () => {
    expect(nextPollDelay(4000, true)).toBe(POLL_MIN_MS);
  });

  it('doubles up to the ceiling when idle', () => {
    expect(nextPollDelay(1000, false)).toBe(2000);
    expect(nextPollDelay(2000, false)).toBe(4000);
    expect(nextPollDelay(4000, false)).toBe(POLL_MAX_MS); // capped at 6000
    expect(nextPollDelay(6000, false)).toBe(POLL_MAX_MS);
  });
});

describe('deckSnapshotChanged', () => {
  it('detects a new deck (null → snapshot) and vice versa', () => {
    expect(deckSnapshotChanged(null, snap(1, [{ slug: 'slide-1', epoch: 1 }]))).toBe(
      true,
    );
    expect(deckSnapshotChanged(snap(1, []), null)).toBe(true);
    expect(deckSnapshotChanged(null, null)).toBe(false);
  });

  it('detects an added slide', () => {
    const prev = snap(1, [{ slug: 'slide-1', epoch: 1 }]);
    const next = snap(1, [
      { slug: 'slide-1', epoch: 1 },
      { slug: 'slide-2', epoch: 1 },
    ]);
    expect(deckSnapshotChanged(prev, next)).toBe(true);
  });

  it('detects a re-uploaded slide via epoch even at the same slide count', () => {
    const prev = snap(1, [{ slug: 'slide-1', epoch: 1 }]);
    const next = snap(2, [{ slug: 'slide-1', epoch: 2 }]); // slide-1 revised
    expect(deckSnapshotChanged(prev, next)).toBe(true);
  });

  it('treats a fresh-presign-only snapshot (same epoch) as unchanged', () => {
    const prev = snap(5, [{ slug: 'slide-1', epoch: 5 }]);
    const next = snap(5, [{ slug: 'slide-1', epoch: 5 }]); // new URLs, same epoch
    expect(deckSnapshotChanged(prev, next)).toBe(false);
  });
});

describe('slideContentKey', () => {
  it('is stable across re-presigns and changes only on epoch bump', () => {
    expect(slideContentKey({ slug: 'slide-1', epoch: 3 })).toBe('slide-1@3');
    expect(slideContentKey({ slug: 'slide-1', epoch: 4 })).not.toBe(
      slideContentKey({ slug: 'slide-1', epoch: 3 }),
    );
  });
});

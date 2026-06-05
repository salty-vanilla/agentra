import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeckSnapshotResponse } from '@/lib/generated/model';
import { useDeckWorkspace } from '../use-deck-workspace';

function snap(epoch: number): DeckSnapshotResponse {
  return {
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja',
    slideOrder: ['slide-1'],
    defsUrl: null,
    defsEpoch: epoch,
    epoch,
    slides: [
      {
        slug: 'slide-1',
        index: 1,
        epoch,
        composeUrl: `https://cdn/slide-1.${epoch}.json`,
        previewUrl: null,
      },
    ],
  };
}

describe('useDeckWorkspace', () => {
  it('fetches immediately when active and exposes the snapshot', async () => {
    const fetcher = vi.fn(async () => snap(1));
    const { result } = renderHook(() =>
      useDeckWorkspace({ threadId: 't', deckId: 'deck-1', active: true, fetcher }),
    );
    await waitFor(() => expect(result.current.snapshot?.epoch).toBe(1));
    expect(fetcher).toHaveBeenCalledWith('t', 'deck-1');
  });

  it('does not poll when inactive or missing ids', async () => {
    const fetcher = vi.fn(async () => snap(1));
    renderHook(() =>
      useDeckWorkspace({ threadId: 't', deckId: 'deck-1', active: false, fetcher }),
    );
    renderHook(() =>
      useDeckWorkspace({ threadId: null, deckId: 'deck-1', active: true, fetcher }),
    );
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refetches immediately when refetchKey changes (SSE trigger)', async () => {
    const fetcher = vi.fn(async () => snap(1));
    const { rerender } = renderHook((props) => useDeckWorkspace(props), {
      initialProps: {
        threadId: 't',
        deckId: 'deck-1',
        active: true,
        refetchKey: 0,
        fetcher,
      },
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ threadId: 't', deckId: 'deck-1', active: true, refetchKey: 1, fetcher });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('keeps the last snapshot when a fetch rejects', async () => {
    const fetcher = vi
      .fn<(threadId: string, deckId: string) => Promise<DeckSnapshotResponse>>()
      .mockResolvedValueOnce(snap(2))
      .mockRejectedValue(new Error('network'));
    const { result, rerender } = renderHook((props) => useDeckWorkspace(props), {
      initialProps: {
        threadId: 't',
        deckId: 'deck-1',
        active: true,
        refetchKey: 0,
        fetcher,
      },
    });
    await waitFor(() => expect(result.current.snapshot?.epoch).toBe(2));
    rerender({ threadId: 't', deckId: 'deck-1', active: true, refetchKey: 1, fetcher });
    // A rejected refetch must not clear the last good snapshot.
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.snapshot?.epoch).toBe(2);
  });
});

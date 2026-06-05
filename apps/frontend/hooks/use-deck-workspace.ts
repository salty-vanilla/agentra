import { useEffect, useRef, useState } from 'react';
import { deckSnapshotChanged, nextPollDelay, POLL_MIN_MS } from '@/lib/deck-workspace';
import { getDeckSnapshot } from '@/lib/generated/agentra';
import type { DeckSnapshotResponse } from '@/lib/generated/model';

export type DeckSnapshotFetcher = (
  threadId: string,
  deckId: string,
) => Promise<DeckSnapshotResponse>;

export interface UseDeckWorkspaceArgs {
  threadId: string | null;
  deckId: string | null;
  /** Poll while the deck is actively generating; stop when idle/complete. */
  active: boolean;
  /**
   * Bump this (e.g. on each SSE deck_progress event, #421) to trigger an
   * immediate refetch and reset the backoff to the floor — SSE is the trigger,
   * the snapshot (#422) is the source of truth.
   */
  refetchKey?: number;
  /** Injectable for tests; defaults to the generated BFF client. */
  fetcher?: DeckSnapshotFetcher;
}

export interface UseDeckWorkspaceResult {
  snapshot: DeckSnapshotResponse | null;
  isPolling: boolean;
}

/**
 * Poll the authoritative Deck Workspace snapshot (Epic #417/#423) with backoff
 * (1s→2s→4s→6s), snapping back to fast polling whenever the deck changes or an
 * SSE trigger arrives. The snapshot is the source of truth, so the deck restores
 * after a reload from a poll alone — no dependency on a live SSE connection.
 */
export function useDeckWorkspace({
  threadId,
  deckId,
  active,
  refetchKey = 0,
  fetcher = getDeckSnapshot,
}: UseDeckWorkspaceArgs): UseDeckWorkspaceResult {
  const [snapshot, setSnapshot] = useState<DeckSnapshotResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const snapshotRef = useRef<DeckSnapshotResponse | null>(null);

  // refetchKey is a deliberate dependency: bumping it (on an SSE event) restarts
  // the effect, refetching immediately and resetting the backoff to the floor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetchKey is an intentional refetch trigger
  useEffect(() => {
    // A new deck: drop any stale snapshot before polling the new one.
    if (snapshotRef.current && snapshotRef.current.deckId !== deckId) {
      snapshotRef.current = null;
      setSnapshot(null);
    }

    if (!threadId || !deckId || !active) {
      setIsPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_MIN_MS;
    setIsPolling(true);

    const tick = async (): Promise<void> => {
      let changed = false;
      try {
        const next = await fetcher(threadId, deckId);
        if (cancelled) return;
        changed = deckSnapshotChanged(snapshotRef.current, next);
        if (changed) {
          snapshotRef.current = next;
          setSnapshot(next);
        }
      } catch {
        // Transient failure — keep the last good snapshot and back off.
      }
      if (cancelled) return;
      delay = nextPollDelay(delay, changed);
      timer = setTimeout(tick, delay);
    };

    void tick(); // immediate first fetch (and on each refetchKey bump)

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [threadId, deckId, active, refetchKey, fetcher]);

  return { snapshot, isPolling };
}

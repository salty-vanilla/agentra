import type { DeckSnapshotResponse } from '@/lib/generated/model';

/**
 * Deck Workspace polling policy (Epic #417/#423).
 *
 * The authoritative deck state comes from `GET /threads/:id/decks/:id`
 * (#422) — this module holds the *pure* polling/backoff/change-detection logic
 * the `useDeckWorkspace` hook drives. SSE deck_progress (#421) is only a refetch
 * trigger; the snapshot is the source of truth, so a reload restores from a poll
 * alone.
 */

export const POLL_MIN_MS = 1000;
export const POLL_MAX_MS = 6000;

/**
 * Next backoff delay: snap back to the floor whenever the deck changed (keep up
 * with active generation), otherwise double up to the ceiling (idle deck).
 */
export function nextPollDelay(current: number, changed: boolean): number {
  if (changed) return POLL_MIN_MS;
  const doubled = current > 0 ? current * 2 : POLL_MIN_MS;
  return Math.min(doubled, POLL_MAX_MS);
}

/**
 * Did the deck change between two snapshots? Keyed off the overall `epoch` plus
 * the per-slide identity (slug + epoch), so a re-uploaded slide (revision, #426)
 * is detected even if the slide count is unchanged.
 */
export function deckSnapshotChanged(
  prev: DeckSnapshotResponse | null,
  next: DeckSnapshotResponse | null,
): boolean {
  if (!prev || !next) return prev !== next;
  if (prev.epoch !== next.epoch) return true;
  if (prev.slides.length !== next.slides.length) return true;
  for (let i = 0; i < next.slides.length; i += 1) {
    const a = prev.slides[i];
    const b = next.slides[i];
    if (!a || a.slug !== b?.slug || a.epoch !== b.epoch) return true;
  }
  return false;
}

/**
 * A stable per-slide cache key (slug + epoch). The compose/preview URL changes
 * every poll (fresh presign) but the *content* only changes when the epoch does,
 * so renderers key off this to avoid re-downloading unchanged slides.
 */
export function slideContentKey(slide: { slug: string; epoch: number }): string {
  return `${slide.slug}@${slide.epoch}`;
}

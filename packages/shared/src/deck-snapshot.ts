/**
 * Deck Workspace authoritative snapshot (Epic #417/#422).
 *
 * The persisted deck under `decks/<id>/...` (written by the slide runtime) is the
 * **source of truth** for the live preview: the SSE deck_progress stream (#421)
 * is only a trigger, while this snapshot carries the real slides / composeUrl /
 * previewUrl / defs / epoch. Lives in `@agentra/shared` so the BFF can project it
 * without depending on the heavy `@agentra/presentation-author` runtime package.
 *
 * Pure: parsing is I/O-free; reading injects its S3 surface (see DeckSnapshotDeps).
 */

/** S3 prefix for persisted deck workspaces (must match the runtime deck-store). */
const DECK_PREFIX = 'decks';

export interface DeckSnapshotSlideKeys {
  slug: string;
  /** 1-based index parsed from the slug (e.g. `slide-3` → 3). */
  index: number;
  /** Latest epoch for this slide's compose (0 for the batch layout). */
  epoch: number;
  composeKey: string;
  previewKey: string | null;
}

export interface ParsedDeckKeys {
  deckJsonKey: string | null;
  defsKey: string | null;
  defsEpoch: number;
  /** Slides ordered by numeric index. */
  slides: DeckSnapshotSlideKeys[];
  slideOrder: string[];
  /** Max epoch across all slides + defs — the deck's overall version. */
  epoch: number;
}

/** Parse `<base>.<epoch>` → [base, epoch]; no trailing `.<digits>` → epoch 0. */
function splitEpoch(base: string): [string, number] {
  const match = base.match(/^(.*)\.(\d+)$/);
  if (match) return [match[1] as string, Number.parseInt(match[2] as string, 10)];
  return [base, 0];
}

/** 1-based index from a `slide-N` style slug; trailing digits, else 0. */
function slugIndex(slug: string): number {
  const match = slug.match(/(\d+)$/);
  return match ? Number.parseInt(match[1] as string, 10) : 0;
}

/**
 * Project the raw S3 keys under a deck prefix into the latest-epoch view of the
 * deck. Pure — no I/O. Handles both the batch layout (stable keys) and the
 * per-slide streaming layout (`<slug>.<epoch>.compose.json`, `defs.<epoch>.json`),
 * always preferring the highest epoch per slide.
 */
export function parseDeckKeys(deckId: string, keys: readonly string[]): ParsedDeckKeys {
  const prefix = `${DECK_PREFIX}/${deckId}/`;
  let deckJsonKey: string | null = null;
  let defsKey: string | null = null;
  let defsEpoch = 0;
  const bySlug = new Map<string, { epoch: number; composeKey: string }>();
  const previewBySlug = new Map<string, string>();

  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const rel = key.slice(prefix.length);

    if (rel === 'deck.json') {
      deckJsonKey = key;
    } else if (rel.startsWith('slides/') && rel.endsWith('.compose.json')) {
      const base = rel.slice('slides/'.length, -'.compose.json'.length);
      const [slug, epoch] = splitEpoch(base);
      const existing = bySlug.get(slug);
      if (!existing || epoch >= existing.epoch) {
        bySlug.set(slug, { epoch, composeKey: key });
      }
    } else if (rel.startsWith('preview/defs') && rel.endsWith('.json')) {
      const middle = rel.slice('preview/defs'.length, -'.json'.length);
      const epoch = middle.startsWith('.')
        ? Number.parseInt(middle.slice(1), 10) || 0
        : 0;
      if (!defsKey || epoch >= defsEpoch) {
        defsKey = key;
        defsEpoch = epoch;
      }
    } else if (rel.startsWith('preview/') && rel.endsWith('.webp')) {
      const slug = rel.slice('preview/'.length, -'.webp'.length);
      previewBySlug.set(slug, key);
    }
  }

  const slides: DeckSnapshotSlideKeys[] = [...bySlug.entries()]
    .map(([slug, { epoch, composeKey }]) => ({
      slug,
      index: slugIndex(slug),
      epoch,
      composeKey,
      previewKey: previewBySlug.get(slug) ?? null,
    }))
    .sort((a, b) => a.index - b.index || a.slug.localeCompare(b.slug));

  const epoch = Math.max(defsEpoch, 0, ...slides.map((s) => s.epoch));

  return {
    deckJsonKey,
    defsKey,
    defsEpoch,
    slides,
    slideOrder: slides.map((s) => s.slug),
    epoch,
  };
}

export interface DeckSnapshotSlide {
  slug: string;
  index: number;
  epoch: number;
  composeUrl: string | null;
  previewUrl: string | null;
}

export interface DeckSnapshot {
  deckId: string;
  name: string;
  language: 'ja' | 'en';
  slideOrder: string[];
  defsUrl: string | null;
  defsEpoch: number;
  slides: DeckSnapshotSlide[];
  /** Overall deck version — bumps when any slide/defs epoch changes. */
  epoch: number;
}

/** I/O surface for {@link getDeckSnapshot}; injectable for tests / any S3 client. */
export interface DeckSnapshotDeps {
  listKeys: (prefix: string) => Promise<string[]>;
  readJson: (key: string) => Promise<Record<string, unknown> | null>;
  presign: (key: string) => Promise<string | null>;
}

/** S3 prefix for a deck's persisted workspace (for the caller's listKeys). */
export function deckSnapshotPrefix(deckId: string): string {
  return `${DECK_PREFIX}/${deckId}/`;
}

/**
 * Read the persisted deck workspace and project it into an authoritative
 * snapshot — the source of truth for the client's deck state, with fresh
 * presigned URLs and an epoch the client can diff against. Returns null when the
 * deck does not exist. Never throws on a missing/partial deck.
 */
export async function getDeckSnapshot(
  input: { deckId: string },
  deps: DeckSnapshotDeps,
): Promise<DeckSnapshot | null> {
  const parsed = parseDeckKeys(
    input.deckId,
    await deps.listKeys(deckSnapshotPrefix(input.deckId)),
  );
  if (!parsed.deckJsonKey && parsed.slides.length === 0) return null;

  const meta = parsed.deckJsonKey
    ? ((await deps.readJson(parsed.deckJsonKey)) ?? {})
    : {};
  const name = typeof meta.name === 'string' ? meta.name : input.deckId;
  const language = meta.language === 'en' ? 'en' : 'ja';

  const [defsUrl, slides] = await Promise.all([
    parsed.defsKey ? deps.presign(parsed.defsKey) : Promise.resolve(null),
    Promise.all(
      parsed.slides.map(async (s) => ({
        slug: s.slug,
        index: s.index,
        epoch: s.epoch,
        composeUrl: await deps.presign(s.composeKey),
        previewUrl: s.previewKey ? await deps.presign(s.previewKey) : null,
      })),
    ),
  ]);

  return {
    deckId: input.deckId,
    name,
    language,
    slideOrder: parsed.slideOrder,
    defsUrl,
    defsEpoch: parsed.defsEpoch,
    slides,
    epoch: parsed.epoch,
  };
}

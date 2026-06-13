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

/** S3 prefix for persisted deck workspaces. Single source of truth — the
 * runtime deck-store (`@agentra/presentation-author`) re-exports this. */
export const DECK_PREFIX = 'decks';

export interface DeckSnapshotSlideKeys {
  slug: string;
  /** 1-based index parsed from the slug (e.g. `slide-3` → 3). */
  index: number;
  /** Latest epoch for this slide's compose (0 for the batch layout). */
  epoch: number;
  composeKey: string;
  previewKey: string | null;
}

/** Raw S3 keys for the SDPM Workspace spec files (Epic #442 / #446). */
export interface ParsedDeckSpecKeys {
  briefKey: string | null;
  outlineKey: string | null;
  artDirectionKey: string | null;
}

/** A `slides/{slug}.json` SDPM slide spec key (not a `.compose.json`). */
export interface ParsedDeckSlideJsonKey {
  slug: string;
  index: number;
  key: string;
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
  /** SDPM Workspace spec file keys (null when absent). */
  specs: ParsedDeckSpecKeys;
  /** SDPM `slides/{slug}.json` spec keys, ordered by index. */
  slideJsonKeys: ParsedDeckSlideJsonKey[];
}

/** Parse `<base>.<epoch>` → [base, epoch]; no trailing `.<digits>` → epoch 0. */
function splitEpoch(base: string): [string, number] {
  const match = base.match(/^(.*)\.(\d+)$/);
  if (match) return [match[1] as string, Number.parseInt(match[2] as string, 10)];
  return [base, 0];
}

/** 1-based index from a `slide-N` style slug; trailing digits, else 1. Clamped
 * to >= 1 so a non-`slide-N` slug still satisfies the response schema. */
function slugIndex(slug: string): number {
  const match = slug.match(/(\d+)$/);
  const parsed = match ? Number.parseInt(match[1] as string, 10) : 1;
  return parsed >= 1 ? parsed : 1;
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
  let briefKey: string | null = null;
  let outlineKey: string | null = null;
  let artDirectionKey: string | null = null;
  const bySlug = new Map<string, { epoch: number; composeKey: string }>();
  const previewBySlug = new Map<string, string>();
  const slideJsonBySlug = new Map<string, string>();

  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const rel = key.slice(prefix.length);

    if (rel === 'deck.json') {
      deckJsonKey = key;
    } else if (rel === 'specs/brief.md') {
      briefKey = key;
    } else if (rel === 'specs/outline.md') {
      outlineKey = key;
    } else if (rel === 'specs/art-direction.html' || rel === 'specs/art-direction.md') {
      artDirectionKey = key;
    } else if (rel.startsWith('slides/') && rel.endsWith('.compose.json')) {
      const base = rel.slice('slides/'.length, -'.compose.json'.length);
      const [slug, epoch] = splitEpoch(base);
      const existing = bySlug.get(slug);
      if (!existing || epoch >= existing.epoch) {
        bySlug.set(slug, { epoch, composeKey: key });
      }
    } else if (rel.startsWith('slides/') && rel.endsWith('.json')) {
      // SDPM slide spec `slides/{slug}.json` (the `.compose.json` case is
      // handled above and matched first).
      const slug = rel.slice('slides/'.length, -'.json'.length);
      if (slug) slideJsonBySlug.set(slug, key);
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

  const slideJsonKeys: ParsedDeckSlideJsonKey[] = [...slideJsonBySlug.entries()]
    .map(([slug, key]) => ({ slug, index: slugIndex(slug), key }))
    .sort((a, b) => a.index - b.index || a.slug.localeCompare(b.slug));

  return {
    deckJsonKey,
    defsKey,
    defsEpoch,
    slides,
    slideOrder: slides.map((s) => s.slug),
    epoch,
    specs: { briefKey, outlineKey, artDirectionKey },
    slideJsonKeys,
  };
}

/**
 * Parse an SDPM `outline.md` body into ordered `[slug, message]` pairs.
 * Format per line: `- [slug] message`. Pure — no I/O.
 */
export function parseOutlineEntries(
  outline: string,
): { slug: string; message: string }[] {
  const pattern = /^-\s*\[([a-z0-9-]+)\]\s*(.*)$/;
  const entries: { slug: string; message: string }[] = [];
  for (const line of outline.split('\n')) {
    const match = line.trim().match(pattern);
    if (match) {
      entries.push({ slug: match[1] as string, message: (match[2] as string).trim() });
    }
  }
  return entries;
}

export interface DeckSnapshotSlide {
  slug: string;
  index: number;
  epoch: number;
  composeUrl: string | null;
  previewUrl: string | null;
}

/** Presigned URLs for the SDPM Workspace spec files (Epic #442 / #446). */
export interface DeckWorkspaceSpecs {
  briefUrl: string | null;
  outlineUrl: string | null;
  artDirectionUrl: string | null;
}

/**
 * A slide as known from the SDPM Workspace before (or independent of) compose.
 * `status: 'ready'` when a compose exists for this slug; otherwise `'skeleton'`,
 * so the client can render a placeholder card until the preview arrives.
 */
export interface DeckWorkspaceSlideSkeleton {
  slug: string;
  index: number;
  title: string | null;
  message: string | null;
  layoutIntent: string | null;
  visualIntent: string | null;
  status: 'skeleton' | 'ready';
}

/** SDPM Workspace projection attached additively to the deck snapshot. */
export interface DeckWorkspaceSnapshot {
  specs: DeckWorkspaceSpecs;
  slides: DeckWorkspaceSlideSkeleton[];
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
  /**
   * SDPM Workspace projection (specs + slide skeletons). Present only for decks
   * authored by the sdpm-skill engine; omitted for agentra-pptxgenjs decks.
   */
  workspace?: DeckWorkspaceSnapshot;
}

/** I/O surface for {@link getDeckSnapshot}; injectable for tests / any S3 client. */
export interface DeckSnapshotDeps {
  listKeys: (prefix: string) => Promise<string[]>;
  readJson: (key: string) => Promise<Record<string, unknown> | null>;
  presign: (key: string) => Promise<string | null>;
  /**
   * Read a key as UTF-8 text (e.g. `specs/outline.md`). Optional: when absent,
   * the workspace projection degrades to keys/JSON only (no outline messages).
   */
  readText?: (key: string) => Promise<string | null>;
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

  const workspace = await buildWorkspaceSnapshot(parsed, deps);

  return {
    deckId: input.deckId,
    name,
    language,
    slideOrder: parsed.slideOrder,
    defsUrl,
    defsEpoch: parsed.defsEpoch,
    slides,
    epoch: parsed.epoch,
    ...(workspace ? { workspace } : {}),
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Extract a display title from an SDPM slide JSON (placeholder 0, else null). */
function slideTitle(slide: Record<string, unknown> | null): string | null {
  if (!slide) return null;
  const explicit = asString(slide.title);
  if (explicit) return explicit;
  const placeholders = slide.placeholders;
  if (placeholders && typeof placeholders === 'object') {
    return asString((placeholders as Record<string, unknown>)['0']);
  }
  return null;
}

/**
 * Build the SDPM Workspace projection. Returns undefined for non-SDPM decks
 * (gated on SDPM-only signals: a brief/art-direction spec or a `slides/*.json`),
 * so agentra-pptxgenjs decks are unaffected. Never throws.
 */
async function buildWorkspaceSnapshot(
  parsed: ParsedDeckKeys,
  deps: DeckSnapshotDeps,
): Promise<DeckWorkspaceSnapshot | undefined> {
  const isSdpm =
    parsed.specs.briefKey !== null ||
    parsed.specs.artDirectionKey !== null ||
    parsed.slideJsonKeys.length > 0;
  if (!isSdpm) return undefined;

  const [briefUrl, outlineUrl, artDirectionUrl, outlineText] = await Promise.all([
    parsed.specs.briefKey ? deps.presign(parsed.specs.briefKey) : Promise.resolve(null),
    parsed.specs.outlineKey
      ? deps.presign(parsed.specs.outlineKey)
      : Promise.resolve(null),
    parsed.specs.artDirectionKey
      ? deps.presign(parsed.specs.artDirectionKey)
      : Promise.resolve(null),
    parsed.specs.outlineKey && deps.readText
      ? deps.readText(parsed.specs.outlineKey)
      : Promise.resolve(null),
  ]);

  const outlineEntries = outlineText ? parseOutlineEntries(outlineText) : [];
  const composeSlugs = new Set(parsed.slides.map((s) => s.slug));
  const slideJsonBySlug = new Map(parsed.slideJsonKeys.map((s) => [s.slug, s.key]));

  // Canonical order: outline order first, then any slide JSON / compose slugs
  // not named in the outline (sorted by index), so partial workspaces degrade.
  const orderedSlugs: string[] = [];
  const seen = new Set<string>();
  const pushSlug = (slug: string) => {
    if (!seen.has(slug)) {
      seen.add(slug);
      orderedSlugs.push(slug);
    }
  };
  for (const entry of outlineEntries) pushSlug(entry.slug);
  for (const s of parsed.slideJsonKeys) pushSlug(s.slug);
  for (const s of parsed.slides) pushSlug(s.slug);

  const messageBySlug = new Map(outlineEntries.map((e) => [e.slug, e.message]));

  const slides: DeckWorkspaceSlideSkeleton[] = await Promise.all(
    orderedSlugs.map(async (slug, i) => {
      const jsonKey = slideJsonBySlug.get(slug);
      const slideJson = jsonKey ? await deps.readJson(jsonKey) : null;
      const message = messageBySlug.get(slug) ?? null;
      return {
        slug,
        index: i + 1,
        title: slideTitle(slideJson),
        message: message && message.length > 0 ? message : null,
        layoutIntent: asString(slideJson?.layout),
        visualIntent:
          asString(slideJson?.visualIntent) ?? asString(slideJson?.visual_intent),
        status: composeSlugs.has(slug) ? ('ready' as const) : ('skeleton' as const),
      };
    }),
  );

  return {
    specs: { briefUrl, outlineUrl, artDirectionUrl },
    slides,
  };
}

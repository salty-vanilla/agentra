import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DECK_PREFIX } from './workspace.js';

const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600;

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
 * deck (Epic #422). Pure — no I/O. Handles both the batch layout (stable keys)
 * and the per-slide streaming layout (`<slug>.<epoch>.compose.json`,
 * `defs.<epoch>.json`), always preferring the highest epoch per slide.
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

/** I/O surface for {@link getDeckSnapshot}; injectable for tests. */
export interface DeckSnapshotDeps {
  listKeys: (prefix: string) => Promise<string[]>;
  readJson: (key: string) => Promise<Record<string, unknown> | null>;
  presign: (key: string) => Promise<string | null>;
}

/**
 * Read the persisted deck workspace and project it into an authoritative
 * snapshot (Epic #422) — the source of truth for the client's deck state, with
 * fresh presigned URLs and an epoch the client can diff against. Returns null
 * when the deck does not exist. Never throws on a missing/partial deck.
 */
export async function getDeckSnapshot(
  input: { deckId: string },
  deps: DeckSnapshotDeps,
): Promise<DeckSnapshot | null> {
  const parsed = parseDeckKeys(
    input.deckId,
    await deps.listKeys(`${DECK_PREFIX}/${input.deckId}/`),
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

/** Build the real S3-backed deps for {@link getDeckSnapshot}. */
export function createS3DeckSnapshotDeps(opts: {
  s3Client: S3Client;
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
}): DeckSnapshotDeps {
  const expiresIn = opts.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS;
  return {
    async listKeys(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const res = await opts.s3Client.send(
          new ListObjectsV2Command({
            Bucket: opts.bucketName,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async readJson(key: string): Promise<Record<string, unknown> | null> {
      try {
        const res = await opts.s3Client.send(
          new GetObjectCommand({ Bucket: opts.bucketName, Key: key }),
        );
        const body = await res.Body?.transformToString();
        return body ? (JSON.parse(body) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    async presign(key: string): Promise<string | null> {
      try {
        return await getSignedUrl(
          opts.s3Client,
          new GetObjectCommand({ Bucket: opts.bucketName, Key: key }),
          { expiresIn },
        );
      } catch {
        return null;
      }
    },
  };
}

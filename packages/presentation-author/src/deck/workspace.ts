import type { DeckSlideManifest } from './types.js';

/** S3 prefix for persisted deck workspaces (kept separate from volatile `runs/`). */
export const DECK_PREFIX = 'decks';

const JSON_CONTENT_TYPE = 'application/json';
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
const WEBP_CONTENT_TYPE = 'image/webp';
const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface DeckMeta {
  deckId: string;
  name: string;
  language: 'ja' | 'en';
  template?: string | undefined;
  fonts?: { fullwidth?: string; halfwidth?: string } | undefined;
  defaultTextColor?: string | undefined;
}

export interface DeckComposeSlide {
  slug: string;
  index: number;
  composePath: string;
  previewPath?: string | undefined;
}

export interface DeckComposeArtifacts {
  defsPath: string;
  slides: DeckComposeSlide[];
  pptxPath?: string | undefined;
  /** Epoch used to version the uploaded PPTX key; defaults to now. */
  pptxEpoch?: number | undefined;
}

export type DeckUploadRole =
  | 'deck-json'
  | 'spec-outline'
  | 'defs'
  | 'compose'
  | 'preview'
  | 'pptx';

export type DeckUploadSource =
  | { kind: 'file'; localPath: string }
  | { kind: 'inline'; body: string };

export interface DeckUploadItem {
  /** Full S3 key under the deck prefix, e.g. `decks/<id>/preview/defs.json`. */
  key: string;
  contentType: string;
  source: DeckUploadSource;
  role: DeckUploadRole;
  slug?: string | undefined;
}

export interface DeckWorkspace {
  deckId: string;
  slideOrder: string[];
  manifests: DeckSlideManifest[];
  items: DeckUploadItem[];
  /** Convenience: keys for assembling the DeckResult after upload. */
  keys: {
    deckJson: string;
    outline: string;
    defs: string;
    pptx: string | null;
  };
}

function deckKey(deckId: string, rel: string): string {
  return `${DECK_PREFIX}/${deckId}/${rel}`;
}

/** Safe key segment: letters, digits, dot, dash, underscore (no `/` or `..`). */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new Error(`Unsafe ${label} for S3 key: ${JSON.stringify(value)}`);
  }
}

/**
 * Project a compose result into the deck workspace layout (pure — no I/O).
 *
 * Produces the ordered upload items (deck.json, specs/outline.md, defs, per-slide
 * compose/preview, pptx) and the lightweight slide manifests. The slide JSON is
 * intentionally minimal (no semantic spec) per the MVP design.
 */
export function buildDeckWorkspace(
  meta: DeckMeta,
  compose: DeckComposeArtifacts,
): DeckWorkspace {
  const { deckId } = meta;
  assertSafeSegment(deckId, 'deckId');
  for (const slide of compose.slides) {
    assertSafeSegment(slide.slug, 'slug');
  }
  const slideOrder = compose.slides.map((s) => s.slug);
  const epoch = compose.pptxEpoch ?? Date.now();

  const deckJson = JSON.stringify({
    template: meta.template ?? null,
    fonts: meta.fonts ?? null,
    defaultTextColor: meta.defaultTextColor ?? null,
    name: meta.name,
    language: meta.language,
  });
  const outlineMd = `${slideOrder.map((slug) => `- [${slug}]`).join('\n')}\n`;

  const deckJsonKey = deckKey(deckId, 'deck.json');
  const outlineKey = deckKey(deckId, 'specs/outline.md');
  const defsKey = deckKey(deckId, 'preview/defs.json');
  const pptxKey = compose.pptxPath ? deckKey(deckId, `pptx/${epoch}.pptx`) : null;

  const items: DeckUploadItem[] = [
    {
      key: deckJsonKey,
      contentType: JSON_CONTENT_TYPE,
      source: { kind: 'inline', body: deckJson },
      role: 'deck-json',
    },
    {
      key: outlineKey,
      contentType: MARKDOWN_CONTENT_TYPE,
      source: { kind: 'inline', body: outlineMd },
      role: 'spec-outline',
    },
    {
      key: defsKey,
      contentType: JSON_CONTENT_TYPE,
      source: { kind: 'file', localPath: compose.defsPath },
      role: 'defs',
    },
  ];

  const manifests: DeckSlideManifest[] = [];
  for (const slide of compose.slides) {
    const composeKey = deckKey(deckId, `slides/${slide.slug}.compose.json`);
    const previewKey = deckKey(deckId, `preview/${slide.slug}.webp`);

    items.push({
      key: composeKey,
      contentType: JSON_CONTENT_TYPE,
      source: { kind: 'file', localPath: slide.composePath },
      role: 'compose',
      slug: slide.slug,
    });
    if (slide.previewPath) {
      items.push({
        key: previewKey,
        contentType: WEBP_CONTENT_TYPE,
        source: { kind: 'file', localPath: slide.previewPath },
        role: 'preview',
        slug: slide.slug,
      });
    }

    manifests.push({
      slug: slide.slug,
      index: slide.index,
      title: null,
      previewKey,
      composeKey,
    });
  }

  if (compose.pptxPath && pptxKey) {
    items.push({
      key: pptxKey,
      contentType: PPTX_CONTENT_TYPE,
      source: { kind: 'file', localPath: compose.pptxPath },
      role: 'pptx',
    });
  }

  return {
    deckId,
    slideOrder,
    manifests,
    items,
    keys: { deckJson: deckJsonKey, outline: outlineKey, defs: defsKey, pptx: pptxKey },
  };
}

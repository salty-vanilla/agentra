import type { DeckSnapshotResponse } from '@/lib/generated/model';

/**
 * Deck Workspace mock fixtures (Epic #423). The `getDeckSnapshot` handler grows
 * the slide count over successive polls so the live-preview polling UX (slides
 * appearing one by one) is exercisable in mock mode. compose/defs are minimal
 * but valid (version 1) so the renderer draws a real SVG.
 */

const MOCK_PREFIX = '/__deck-mock__';
const TOTAL_SLIDES = 4;
const SLIDE_TITLES = ['茶道の起源', '千利休と侘び茶', '茶室と道具', '現代の茶道'];

/** Per-deck poll counter so each poll reveals one more slide, then stays stable. */
const pollCounts = new Map<string, number>();

export function resetDeckMockState(): void {
  pollCounts.clear();
}

/** Build a minimal valid compose payload (a titled slide) for a slug. */
export function mockComposeFor(slug: string): unknown {
  const index = Number.parseInt(slug.match(/(\d+)$/)?.[1] ?? '1', 10);
  const title = SLIDE_TITLES[(index - 1) % SLIDE_TITLES.length] ?? slug;
  return {
    version: 1,
    viewBox: '0 0 1280 720',
    bgFill: '#0f172a',
    bgSvg: null,
    components: [
      {
        class: 'title',
        bbox: { x: 96, y: 300, w: 1088, h: 120 },
        text: title,
        svg: `<text x="96" y="380" font-family="sans-serif" font-size="64" fill="#f8fafc">${title}</text><text x="96" y="450" font-family="sans-serif" font-size="28" fill="#94a3b8">${index} / ${TOTAL_SLIDES}</text>`,
        changed: false,
      },
    ],
  };
}

export const MOCK_DEFS = { version: 1, defs: '' };

/** Progressive snapshot: poll N → min(N, TOTAL) slides with epoch-versioned URLs. */
export function mockDeckSnapshot(deckId: string): DeckSnapshotResponse {
  const count = Math.min((pollCounts.get(deckId) ?? 0) + 1, TOTAL_SLIDES);
  pollCounts.set(deckId, count);
  const epoch = count; // epoch grows with the revealed slide count

  const slides = Array.from({ length: count }, (_, i) => {
    const slug = `slide-${i + 1}`;
    return {
      slug,
      index: i + 1,
      epoch: i + 1,
      composeUrl: `${MOCK_PREFIX}/${deckId}/${slug}.${i + 1}.compose.json`,
      previewUrl: null,
    };
  });

  return {
    deckId,
    name: '茶道の歴史',
    language: 'ja',
    slideOrder: slides.map((s) => s.slug),
    defsUrl: `${MOCK_PREFIX}/${deckId}/defs.json`,
    defsEpoch: epoch,
    slides,
    epoch,
  };
}

export const DECK_MOCK_ASSET_PATTERN = `*${MOCK_PREFIX}/*`;

/** Resolve a mock compose/defs asset URL to its JSON body. */
export function resolveDeckMockAsset(url: string): unknown | null {
  if (url.endsWith('/defs.json')) return MOCK_DEFS;
  const composeMatch = url.match(/\/(slide-\d+)\.\d+\.compose\.json$/);
  if (composeMatch) return mockComposeFor(composeMatch[1] as string);
  return null;
}

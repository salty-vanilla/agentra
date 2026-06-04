import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reduceDeckStream } from '@/lib/deck-stream';
import type { DeckPreviewEvent } from '@/lib/generated/model';
import { StreamingDeckPreview } from '../streaming-deck-preview';

const defsPayload = { version: 1, defs: '<defs id="shared"/>' };

function composePayload(label: string) {
  return {
    version: 1,
    viewBox: '0 0 33867 19050',
    bgFill: '#232F3E',
    bgSvg: null,
    components: [
      {
        class: 'TitleText',
        bbox: null,
        text: label,
        svg: `<text>${label}</text>`,
        changed: false,
      },
    ],
  };
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    let body: unknown;
    if (url.includes('defs.json')) body = defsPayload;
    else if (url.includes('cover.json')) body = composePayload('CoverTitle');
    else if (url.includes('agenda.json')) body = composePayload('AgendaTitle');
    else throw new Error(`unexpected url ${url}`);
    return { ok: true, json: async () => body } as Response;
  });
}

const started: DeckPreviewEvent = {
  type: 'deck_preview_started',
  deckId: 'deck-1',
  name: 'My Streaming Deck',
  totalSlides: 2,
};

function slide(index: number, slug: string): DeckPreviewEvent {
  return {
    type: 'deck_slide_compose_ready',
    deckId: 'deck-1',
    slug,
    index,
    totalSlides: 2,
    composeUrl: `https://example.com/${slug}.json`,
    defsUrl: 'https://example.com/defs.json',
    previewUrl: null,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('StreamingDeckPreview', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<StreamingDeckPreview state={reduceDeckStream([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the planning placeholder before any slide arrives', () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<StreamingDeckPreview state={reduceDeckStream([started])} />);
    expect(screen.getByText('My Streaming Deck')).toBeInTheDocument();
    // Planning label appears in both the status badge and the placeholder frame.
    expect(screen.getAllByText('アウトラインを作成中…').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('renders the first slide SVG once its compose arrives (mid-stream)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(
      <StreamingDeckPreview state={reduceDeckStream([started, slide(1, 'cover')])} />,
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('deck-slide-svg').innerHTML).toContain('CoverTitle'),
    );
  });

  it('advances the counter and surfaces the newest slide as more arrive', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const state = reduceDeckStream([started, slide(1, 'cover'), slide(2, 'agenda')]);
    render(<StreamingDeckPreview state={state} />);

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    // Newest slide (agenda) is auto-selected as the main frame.
    await waitFor(() =>
      expect(screen.getByTestId('deck-slide-svg').innerHTML).toContain('AgendaTitle'),
    );
  });

  it('reflects a failed terminal state without dropping ready slides', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const state = reduceDeckStream([
      started,
      slide(1, 'cover'),
      { type: 'deck_preview_failed', deckId: 'deck-1', reason: 'compose failed' },
    ]);
    const { container } = render(<StreamingDeckPreview state={state} />);

    expect(container.querySelector('[data-phase="failed"]')).not.toBeNull();
    expect(screen.getByText('一部のプレビュー生成に失敗しました')).toBeInTheDocument();
    // The already-ready slide still renders.
    await waitFor(() =>
      expect(screen.getByTestId('deck-slide-svg').innerHTML).toContain('CoverTitle'),
    );
  });
});

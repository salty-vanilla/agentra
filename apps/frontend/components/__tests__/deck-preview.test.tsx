import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeckResult } from '@/lib/generated/model';
import { DeckPreview } from '../deck-preview';

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

const deck: DeckResult = {
  deckId: 'deck-1',
  name: 'My Deck',
  language: 'ja',
  slideOrder: ['intro', 'body'],
  defsUrl: 'https://example.com/defs.json?sig',
  pptxDownloadUrl: null,
  specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
  slides: [
    { slug: 'intro', previewUrl: null, composeUrl: 'https://example.com/intro.json?sig' },
    { slug: 'body', previewUrl: null, composeUrl: 'https://example.com/body.json?sig' },
  ],
  version: 1,
};

function mockFetch() {
  return vi.fn(async (url: string) => {
    let body: unknown;
    if (url.includes('defs.json')) body = defsPayload;
    else if (url.includes('intro.json')) body = composePayload('IntroTitle');
    else if (url.includes('body.json')) body = composePayload('BodyTitle');
    else throw new Error(`unexpected url ${url}`);
    return { ok: true, json: async () => body } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeckPreview', () => {
  it('renders the deck name, slide counter, and builds the slide SVG from compose+defs', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<DeckPreview deck={deck} />);

    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await waitFor(() => {
      const frame = screen.getByTestId('deck-slide-svg');
      expect(frame.querySelector('svg')).not.toBeNull();
      expect(frame.innerHTML).toContain('IntroTitle');
      expect(frame.innerHTML).toContain('<defs id="shared"');
    });
  });

  it('navigates to the next slide and rebuilds the SVG', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<DeckPreview deck={deck} />);
    await waitFor(() =>
      expect(screen.getByTestId('deck-slide-svg').innerHTML).toContain('IntroTitle'),
    );

    await userEvent.click(screen.getByLabelText('次のスライド'));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('deck-slide-svg').innerHTML).toContain('BodyTitle'),
    );
  });

  it('shows a placeholder when a slide has neither compose nor poster', () => {
    vi.stubGlobal('fetch', mockFetch());
    const noPreview: DeckResult = {
      ...deck,
      defsUrl: null,
      slides: [{ slug: 'intro', previewUrl: null, composeUrl: null }],
    };
    render(<DeckPreview deck={noPreview} />);
    expect(screen.getByText('プレビューを生成中…')).toBeInTheDocument();
  });

  it('shows an error (not a perpetual spinner) when the defs fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('defs.json')) return { ok: false, status: 404 } as Response;
        return { ok: true, json: async () => composePayload('IntroTitle') } as Response;
      }),
    );
    render(<DeckPreview deck={deck} />);
    await waitFor(() =>
      expect(screen.getByText('プレビューを読み込めませんでした')).toBeInTheDocument(),
    );
  });

  it('renders nothing when the deck has no slides', () => {
    vi.stubGlobal('fetch', mockFetch());
    const { container } = render(<DeckPreview deck={{ ...deck, slides: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

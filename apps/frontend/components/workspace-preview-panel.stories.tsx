import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import type { DeckSnapshotResponse } from '@/lib/generated/model';
import { WorkspacePreviewPanel } from './workspace-preview-panel';

const DEFS_URL = 'https://example.com/wsdeck/defs.json';
const COMPOSE_1_URL = 'https://example.com/wsdeck/slide-1.json';

const defs = {
  version: 1,
  defs: '<defs><linearGradient id="g"><stop offset="0" stop-color="#3b6cf0"/><stop offset="1" stop-color="#2ba882"/></linearGradient></defs>',
};

const compose1 = {
  version: 1,
  viewBox: '0 0 33867 19050',
  bgFill: '#232F3E',
  bgSvg: null,
  components: [
    {
      class: 'TitleText',
      bbox: { x: 2000, y: 2500, w: 24000, h: 3000 },
      text: 'はじめに',
      svg: '<text x="2000" y="5000" font-size="2200" fill="#ffffff" font-family="sans-serif">はじめに</text>',
      changed: false,
    },
  ],
};

function snapshot(overrides: Partial<DeckSnapshotResponse>): DeckSnapshotResponse {
  return {
    deckId: 'deck-ws',
    name: 'SDPM Workspace デモ',
    language: 'ja',
    slideOrder: [],
    defsUrl: null,
    defsEpoch: 0,
    slides: [],
    epoch: 1,
    ...overrides,
  };
}

const meta: Meta<typeof WorkspacePreviewPanel> = {
  title: 'Deck/WorkspacePreviewPanel',
  component: WorkspacePreviewPanel,
  parameters: {
    layout: 'centered',
    msw: {
      handlers: [
        http.get(DEFS_URL, () => HttpResponse.json(defs)),
        http.get(COMPOSE_1_URL, () => HttpResponse.json(compose1)),
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof WorkspacePreviewPanel>;

/** Brief authored, outline just starting — no slides yet. */
export const BriefOnly: Story = {
  args: {
    snapshot: snapshot({
      workspace: {
        specs: {
          briefUrl: 'https://example.com/brief.md',
          outlineUrl: null,
          artDirectionUrl: null,
        },
        slides: [],
      },
    }),
  },
};

/** Outline + skeletons, no compose previews yet. */
export const SkeletonsOnly: Story = {
  args: {
    snapshot: snapshot({
      workspace: {
        specs: {
          briefUrl: 'https://example.com/brief.md',
          outlineUrl: 'https://example.com/outline.md',
          artDirectionUrl: 'https://example.com/art.html',
        },
        slides: [
          {
            slug: 'intro',
            index: 1,
            title: 'はじめに',
            message: '目的を伝える',
            layoutIntent: 'Title Slide',
            status: 'skeleton',
          },
          {
            slug: 'problem',
            index: 2,
            title: '課題',
            message: '現状の痛みを示す',
            layoutIntent: 'Blank',
            status: 'skeleton',
          },
          {
            slug: 'summary',
            index: 3,
            title: 'まとめ',
            message: '行動を促す',
            layoutIntent: 'Blank',
            status: 'skeleton',
          },
        ],
      },
    }),
  },
};

/** First slide compose-ready (renders real preview), rest still skeletons. */
export const PartiallyReady: Story = {
  args: {
    snapshot: snapshot({
      defsUrl: DEFS_URL,
      slides: [
        {
          slug: 'slide-1',
          index: 1,
          epoch: 1,
          composeUrl: COMPOSE_1_URL,
          previewUrl: null,
        },
      ],
      workspace: {
        specs: {
          briefUrl: 'https://example.com/brief.md',
          outlineUrl: 'https://example.com/outline.md',
          artDirectionUrl: null,
        },
        slides: [
          {
            slug: 'intro',
            index: 1,
            title: 'はじめに',
            message: '目的を伝える',
            layoutIntent: 'Title Slide',
            status: 'ready',
          },
          {
            slug: 'problem',
            index: 2,
            title: '課題',
            message: '現状の痛みを示す',
            layoutIntent: 'Blank',
            status: 'skeleton',
          },
        ],
      },
    }),
  },
};

/** No workspace (agentra-pptxgenjs deck) — panel renders nothing. */
export const NoWorkspace: Story = {
  args: { snapshot: snapshot({}) },
};

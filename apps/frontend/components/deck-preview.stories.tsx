import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import type { DeckResult } from '@/lib/generated/model';
import { DeckPreview } from './deck-preview';

const DEFS_URL = 'https://example.com/deck/defs.json';
const INTRO_URL = 'https://example.com/deck/intro.json';
const BODY_URL = 'https://example.com/deck/body.json';

const defs = {
  version: 1,
  defs: '<defs><linearGradient id="g"><stop offset="0" stop-color="#3b6cf0"/><stop offset="1" stop-color="#2ba882"/></linearGradient></defs>',
};

function compose(title: string, accent: string) {
  return {
    version: 1,
    viewBox: '0 0 33867 19050',
    bgFill: '#232F3E',
    bgSvg: null,
    components: [
      {
        class: 'TitleText',
        bbox: { x: 2000, y: 2500, w: 24000, h: 3000 },
        text: title,
        svg: `<text x="2000" y="5000" font-size="2200" fill="#ffffff" font-family="sans-serif">${title}</text>`,
        changed: false,
      },
      {
        class: 'Graphic',
        bbox: { x: 2000, y: 8000, w: 12000, h: 7000 },
        text: '',
        svg: `<rect x="2000" y="8000" width="12000" height="7000" rx="400" fill="${accent}"/>`,
        changed: false,
      },
    ],
  };
}

const deck: DeckResult = {
  deckId: 'deck-1',
  name: 'AgentCore 入門デッキ',
  language: 'ja',
  slideOrder: ['intro', 'body'],
  defsUrl: DEFS_URL,
  pptxDownloadUrl: null,
  specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
  slides: [
    { slug: 'intro', previewUrl: null, composeUrl: INTRO_URL },
    { slug: 'body', previewUrl: null, composeUrl: BODY_URL },
  ],
  version: 1,
};

const handlers = [
  http.get(DEFS_URL, () => HttpResponse.json(defs)),
  http.get(INTRO_URL, () => HttpResponse.json(compose('Introduction', '#3b6cf0'))),
  http.get(BODY_URL, () => HttpResponse.json(compose('How it works', '#8b5cf6'))),
];

const meta: Meta<typeof DeckPreview> = {
  title: 'Components/DeckPreview',
  component: DeckPreview,
  parameters: { layout: 'centered', msw: { handlers } },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DeckPreview>;

export const MultiSlide: Story = {
  args: { deck },
};

export const SingleSlide: Story = {
  args: {
    deck: { ...deck, slideOrder: ['intro'], slides: deck.slides.slice(0, 1) },
  },
};

export const DefsUnavailable: Story = {
  name: 'Defs unavailable (placeholder)',
  args: { deck: { ...deck, defsUrl: null } },
  parameters: {
    msw: {
      handlers: [
        http.get(DEFS_URL, () => new HttpResponse(null, { status: 404 })),
        http.get(INTRO_URL, () => HttpResponse.json(compose('Introduction', '#3b6cf0'))),
        http.get(BODY_URL, () => HttpResponse.json(compose('How it works', '#8b5cf6'))),
      ],
    },
  },
};

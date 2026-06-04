import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import { reduceDeckStream } from '@/lib/deck-stream';
import type { DeckPreviewEvent } from '@/lib/generated/model';
import { StreamingDeckPreview } from './streaming-deck-preview';

const DEFS_URL = 'https://example.com/deck/defs.json';
const COVER_URL = 'https://example.com/deck/cover.json';
const AGENDA_URL = 'https://example.com/deck/agenda.json';
const SUMMARY_URL = 'https://example.com/deck/summary.json';

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

const DECK_ID = 'deck-1';
const NAME = 'AgentCore 入門デッキ';

const started: DeckPreviewEvent = {
  type: 'deck_preview_started',
  deckId: DECK_ID,
  name: NAME,
  totalSlides: 3,
};

function slideEvent(index: number, slug: string, url: string): DeckPreviewEvent {
  return {
    type: 'deck_slide_compose_ready',
    deckId: DECK_ID,
    slug,
    index,
    totalSlides: 3,
    composeUrl: url,
    defsUrl: DEFS_URL,
    previewUrl: null,
  };
}

const completed: DeckPreviewEvent = {
  type: 'deck_preview_completed',
  deckId: DECK_ID,
  totalSlides: 3,
};

const handlers = [
  http.get(DEFS_URL, () => HttpResponse.json(defs)),
  http.get(COVER_URL, () => HttpResponse.json(compose('Cover', '#3b6cf0'))),
  http.get(AGENDA_URL, () => HttpResponse.json(compose('Agenda', '#8b5cf6'))),
  http.get(SUMMARY_URL, () => HttpResponse.json(compose('Summary', '#2ba882'))),
];

const meta: Meta<typeof StreamingDeckPreview> = {
  title: 'Components/StreamingDeckPreview',
  component: StreamingDeckPreview,
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
type Story = StoryObj<typeof StreamingDeckPreview>;

export const Planning: Story = {
  name: 'Planning (no slides yet)',
  args: { state: reduceDeckStream([started]) },
};

export const GeneratingFirstSlide: Story = {
  name: 'Generating (1 of 3)',
  args: { state: reduceDeckStream([started, slideEvent(1, 'cover', COVER_URL)]) },
};

export const GeneratingPartial: Story = {
  name: 'Generating (2 of 3)',
  args: {
    state: reduceDeckStream([
      started,
      slideEvent(1, 'cover', COVER_URL),
      slideEvent(2, 'agenda', AGENDA_URL),
    ]),
  },
};

export const Completed: Story = {
  args: {
    state: reduceDeckStream([
      started,
      slideEvent(1, 'cover', COVER_URL),
      slideEvent(2, 'agenda', AGENDA_URL),
      slideEvent(3, 'summary', SUMMARY_URL),
      completed,
    ]),
  },
};

export const Failed: Story = {
  name: 'Failed (degraded, keeps ready slides)',
  args: {
    state: reduceDeckStream([
      started,
      slideEvent(1, 'cover', COVER_URL),
      {
        type: 'deck_preview_failed',
        deckId: DECK_ID,
        reason: 'compose produced no slides',
      },
    ]),
  },
};

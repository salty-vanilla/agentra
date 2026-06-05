import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AnimBox } from '@/lib/deck-anim';
import { AnimatedSlideOverlay } from './animated-slide-overlay';

/**
 * The transient animation overlay (Epic #424). In Storybook it plays on a plain
 * 16:9 frame so each box's wireframe-draw + cursor-tap is visible. Change the
 * `runKey` control to replay.
 */
const meta = {
  title: 'Deck/AnimatedSlideOverlay',
  component: AnimatedSlideOverlay,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="relative aspect-video w-[640px] overflow-hidden rounded-md border bg-slate-900">
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
          (static slide SVG renders here)
        </div>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnimatedSlideOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = (
  index: number,
  leftPct: number,
  topPct: number,
  widthPct: number,
  heightPct: number,
): AnimBox => ({
  index,
  leftPct,
  topPct,
  widthPct,
  heightPct,
  cxPct: leftPct + widthPct / 2,
  cyPct: topPct + heightPct / 2,
});

/** First appearance: every component draws on, staggered. */
export const FirstAppearance: Story = {
  args: {
    runKey: 'first',
    boxes: [box(0, 8, 10, 84, 22), box(1, 8, 40, 50, 14), box(2, 8, 60, 84, 28)],
  },
};

/** A revision: only the single changed component animates. */
export const SingleChanged: Story = {
  args: {
    runKey: 'revised',
    boxes: [box(1, 8, 40, 50, 14)],
  },
};

/** No changes → nothing renders. */
export const NoChanges: Story = {
  args: {
    runKey: 'none',
    boxes: [],
  },
};

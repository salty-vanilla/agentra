import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandMark } from './brand-mark';

const meta = {
  title: 'Components/BrandMark',
  component: BrandMark,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    className: 'size-24',
    adaptive: false,
  },
} satisfies Meta<typeof BrandMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    adaptive: false,
  },
};

export const AdaptiveLight: Story = {
  args: {
    adaptive: true,
  },
};

export const AdaptiveDark: Story = {
  args: {
    adaptive: true,
  },
  decorators: [
    (Story) => (
      <div className="dark rounded-2xl bg-background p-8">
        <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-8">
          <Story />
        </div>
      </div>
    ),
  ],
};

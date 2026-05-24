import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ModelSelector } from './model-selector';

const meta = {
  title: 'Components/ModelSelector',
  component: ModelSelector,
  tags: ['autodocs'],
  args: {
    onChange: () => {},
  },
} satisfies Meta<typeof ModelSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sonnet: Story = {
  args: {
    value: 'sonnet',
  },
};

export const Opus: Story = {
  args: {
    value: 'opus',
  },
};

export const Haiku: Story = {
  args: {
    value: 'haiku',
  },
};

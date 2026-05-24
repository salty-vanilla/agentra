import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SlideCommandBadge } from './slide-command-badge';

const meta = {
  title: 'Components/SlideCommandBadge',
  component: SlideCommandBadge,
  tags: ['autodocs'],
} satisfies Meta<typeof SlideCommandBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRemove: Story = {
  args: { onRemove: () => {} },
};

export const WithoutRemove: Story = {
  args: {},
};

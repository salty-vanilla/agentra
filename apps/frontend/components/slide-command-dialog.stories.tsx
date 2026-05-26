import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SlideCommandDialog } from './slide-command-dialog';

const meta = {
  title: 'Components/SlideCommandDialog',
  component: SlideCommandDialog,
  tags: ['autodocs'],
  args: {
    onSubmit: () => {},
    onOpenChange: () => {},
  },
} satisfies Meta<typeof SlideCommandDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogOpen: Story = {
  args: {
    externalOpen: true,
  },
};

export const DialogClosed: Story = {
  args: {
    externalOpen: false,
  },
};

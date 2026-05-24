import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DownloadIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Click me' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
  args: { variant: 'outline' },
};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const Ghost: Story = {
  args: { variant: 'ghost' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
};

export const Link: Story = {
  args: { variant: 'link' },
};

export const Small: Story = {
  args: { size: 'sm' },
};

export const Large: Story = {
  args: { size: 'lg' },
};

export const Icon: Story = {
  args: { size: 'icon', children: <PlusIcon /> },
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <DownloadIcon />
        Download
      </>
    ),
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

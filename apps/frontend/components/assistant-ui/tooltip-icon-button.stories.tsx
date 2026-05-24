import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SearchIcon } from 'lucide-react';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';

const meta = {
  title: 'AssistantUI/TooltipIconButton',
  component: TooltipIconButton,
  tags: ['autodocs'],
  args: {
    tooltip: 'アクションを実行',
    children: <SearchIcon />,
  },
} satisfies Meta<typeof TooltipIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TopSide: Story = {
  args: { side: 'top', tooltip: '上に表示されるツールチップ' },
};

export const Disabled: Story = {
  args: { disabled: true, tooltip: '無効化されたボタン' },
};

export const LongTooltip: Story = {
  args: {
    tooltip:
      'これは非常に長いツールチップのテキストです。ボタンの説明が長い場合の表示を確認します。',
  },
};

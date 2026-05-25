import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComposerShellView } from './composer-shell-view';
import { TooltipIconButton } from './tooltip-icon-button';

const MockInput = () => (
  <textarea
    className="aui-composer-input max-h-32 min-h-[1.75rem] w-full resize-none bg-transparent px-1.5 py-0.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
    rows={1}
    placeholder="質問や次の実装指示を入力してください（/slide でスライド作成）"
  />
);

const SendButton = () => (
  <TooltipIconButton
    tooltip="Send message"
    side="bottom"
    type="button"
    variant="default"
    size="icon"
    className="aui-composer-send size-8 rounded-full"
    aria-label="Send message"
  >
    <ArrowUpIcon className="aui-composer-send-icon size-4" />
  </TooltipIconButton>
);

const CancelButton = () => (
  <Button
    type="button"
    variant="default"
    size="icon"
    className="aui-composer-cancel size-8 rounded-full"
    aria-label="Stop generating"
  >
    <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
  </Button>
);

const meta = {
  title: 'Components/ComposerShellView',
  component: ComposerShellView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    modelValue: 'sonnet',
    onModelChange: () => {},
    onSlideCommandActivate: () => {},
    onSlideCommandDeactivate: () => {},
    showModelSelector: true,
    inputSlot: <MockInput />,
    actionSlot: <SendButton />,
  },
} satisfies Meta<typeof ComposerShellView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithSlideCommand: Story = {
  args: {
    slideCommandActive: true,
  },
};

export const WithSlidePrefix: Story = {
  args: {
    hasSlidePrefix: true,
  },
};

export const Running: Story = {
  args: {
    actionSlot: <CancelButton />,
  },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div
        style={{
          width: '320px',
          ['--composer-radius' as string]: '24px',
          ['--composer-padding' as string]: '10px',
        }}
      >
        <Story />
      </div>
    ),
  ],
};

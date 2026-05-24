import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withAssistantRuntime } from '@/.storybook/decorators/with-assistant-runtime';
import { ComposerView } from './composer-view';

const meta = {
  title: 'Components/ComposerView',
  component: ComposerView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [withAssistantRuntime],
  args: {
    modelValue: 'sonnet',
    onModelChange: () => {},
    onSlideCommandActivate: () => {},
    onSlideCommandDeactivate: () => {},
  },
} satisfies Meta<typeof ComposerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    isRunning: false,
  },
};

export const WithSlideCommand: Story = {
  args: {
    slideCommandActive: true,
    isRunning: false,
  },
};

export const WithSlidePrefix: Story = {
  args: {
    hasSlidePrefix: true,
    isRunning: false,
  },
};

export const Running: Story = {
  args: {
    isRunning: true,
    onCancel: () => {},
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
  args: {
    isRunning: false,
  },
};

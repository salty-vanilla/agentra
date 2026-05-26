import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WelcomePromptCards } from './welcome-prompt-cards';

const meta = {
  title: 'Components/WelcomePromptCards',
  component: WelcomePromptCards,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onSelect: () => {} },
} satisfies Meta<typeof WelcomePromptCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    ),
  ],
};

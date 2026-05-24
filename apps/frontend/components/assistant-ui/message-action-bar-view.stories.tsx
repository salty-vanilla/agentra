import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { observabilityFixtures } from '@/mocks/fixtures/observability';
import { BranchPickerView, MessageActionBarView } from './message-action-bar-view';

const meta = {
  title: 'Components/MessageActionBarView',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

export const ActionBarDefault: StoryObj = {
  render: () => (
    <MessageActionBarView
      isCopied={false}
      onCopy={() => {}}
      onReload={() => {}}
      onExportMarkdown={() => {}}
    />
  ),
};

export const ActionBarCopied: StoryObj = {
  render: () => (
    <MessageActionBarView isCopied={true} onCopy={() => {}} onReload={() => {}} />
  ),
};

export const ActionBarWithObservability: StoryObj = {
  render: () => (
    <MessageActionBarView
      isCopied={false}
      onCopy={() => {}}
      hasSummary={true}
      observabilitySummary={observabilityFixtures.successWithTools}
    />
  ),
};

export const BranchPickerState: StoryObj = {
  render: () => (
    <BranchPickerView
      currentBranch={2}
      totalBranches={3}
      onPrev={() => {}}
      onNext={() => {}}
    />
  ),
};

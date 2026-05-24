import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { observabilityFixtures } from '@/mocks/fixtures/observability';
import { ObservabilityDetailsView } from './observability-details-view';

const meta = {
  title: 'Components/ObservabilityDetailsView',
  component: ObservabilityDetailsView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ObservabilityDetailsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuccessNoTools: Story = {
  args: {
    summary: observabilityFixtures.successNoTools,
  },
};

export const SuccessWithTools: Story = {
  args: {
    summary: observabilityFixtures.successWithTools,
  },
};

export const WithToolFailure: Story = {
  args: {
    summary: observabilityFixtures.withToolFailure,
  },
};

export const TokenUsageMissing: Story = {
  args: {
    summary: observabilityFixtures.tokenUsageMissing,
  },
};

export const WithAgentMetadata: Story = {
  args: {
    summary: observabilityFixtures.withAgentMetadata,
  },
};

export const LongToolName: Story = {
  args: {
    summary: observabilityFixtures.longToolName,
  },
};

export const ErrorStatus: Story = {
  args: {
    summary: observabilityFixtures.errorStatus,
  },
};

export const CancelledStatus: Story = {
  args: {
    summary: observabilityFixtures.cancelledStatus,
  },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    summary: observabilityFixtures.withToolFailure,
  },
};

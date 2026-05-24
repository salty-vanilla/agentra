import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SubAgentProgressEvent } from '@/lib/generated/model';
import { SubAgentProgressCard } from './sub-agent-progress-card';

const meta = {
  title: 'Components/SubAgentProgressCard',
  component: SubAgentProgressCard,
  tags: ['autodocs'],
} satisfies Meta<typeof SubAgentProgressCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const makeEvent = (
  stage: string,
  status: SubAgentProgressEvent['status'],
  durationMs?: number,
): SubAgentProgressEvent => ({
  type: 'sub_agent_progress',
  stage,
  status,
  ...(durationMs !== undefined ? { durationMs } : {}),
  timestamp: new Date().toISOString(),
});

export const SingleRunning: Story = {
  args: {
    events: [makeEvent('kb_retrieve', 'running')],
  },
};

export const MultipleAgents: Story = {
  args: {
    events: [
      makeEvent('router', 'complete', 120),
      makeEvent('kb_retrieve', 'complete', 800),
      makeEvent('structured_rag_flow', 'running'),
    ],
  },
};

export const AllComplete: Story = {
  args: {
    events: [
      makeEvent('router', 'complete', 100),
      makeEvent('web_research', 'complete', 2400),
      makeEvent('kb_answer_synthesis', 'complete', 650),
    ],
  },
};

export const WithError: Story = {
  args: {
    events: [
      makeEvent('router', 'complete', 110),
      makeEvent('kb_retrieve', 'error', 300),
    ],
  },
};

export const CreateSlide: Story = {
  args: {
    events: [makeEvent('router', 'complete', 90), makeEvent('create_slide', 'running')],
  },
};

export const LongText: Story = {
  args: {
    events: [
      makeEvent(
        'very_long_stage_name_for_overflow_testing_structured_rag_retrieval_pipeline',
        'complete',
        1200,
      ),
      makeEvent(
        'another_extremely_long_stage_identifier_that_exceeds_typical_display_width',
        'running',
      ),
    ],
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
    events: [
      makeEvent('router', 'complete', 90),
      makeEvent('kb_retrieve', 'complete', 800),
      makeEvent('structured_rag_flow', 'running'),
    ],
  },
};

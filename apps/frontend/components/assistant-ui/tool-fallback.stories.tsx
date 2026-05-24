import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type React from 'react';
import {
  ToolFallbackArgs,
  ToolFallbackContent,
  ToolFallbackError,
  ToolFallbackResult,
  ToolFallbackRoot,
  ToolFallbackTrigger,
} from './tool-fallback';

const meta = {
  title: 'AssistantUI/ToolFallback',
  tags: ['autodocs'],
  component: ToolFallbackRoot,
  decorators: [
    (Story: React.ComponentType) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolFallbackRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  render: () => (
    <ToolFallbackRoot>
      <ToolFallbackTrigger toolName="web_search" status={{ type: 'running' }} />
    </ToolFallbackRoot>
  ),
};

export const SuccessExpanded: Story = {
  render: () => (
    <ToolFallbackRoot defaultOpen>
      <ToolFallbackTrigger toolName="get_weather" status={{ type: 'complete' }} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText={JSON.stringify({ location: 'Tokyo' }, null, 2)} />
        <ToolFallbackResult
          result={{ temperature: 22, unit: 'C', description: 'Sunny' }}
        />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  ),
};

export const SuccessCollapsed: Story = {
  render: () => (
    <ToolFallbackRoot>
      <ToolFallbackTrigger toolName="get_weather" status={{ type: 'complete' }} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText={JSON.stringify({ location: 'Tokyo' }, null, 2)} />
        <ToolFallbackResult result={{ temperature: 22, unit: 'C' }} />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  ),
};

export const WithError: Story = {
  render: () => (
    <ToolFallbackRoot defaultOpen>
      <ToolFallbackTrigger
        toolName="fetch_data"
        status={{
          type: 'incomplete',
          reason: 'error',
          error: 'Network timeout after 30s',
        }}
      />
      <ToolFallbackContent>
        <ToolFallbackError
          status={{
            type: 'incomplete',
            reason: 'error',
            error: 'Network timeout after 30s',
          }}
        />
        <ToolFallbackArgs
          argsText={JSON.stringify({ url: 'https://api.example.com/data' }, null, 2)}
        />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  ),
};

export const Cancelled: Story = {
  render: () => (
    <ToolFallbackRoot>
      <ToolFallbackTrigger
        toolName="long_running_task"
        status={{ type: 'incomplete', reason: 'cancelled' }}
      />
    </ToolFallbackRoot>
  ),
};

export const TextResult: Story = {
  render: () => (
    <ToolFallbackRoot defaultOpen>
      <ToolFallbackTrigger toolName="summarize_text" status={{ type: 'complete' }} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText="text: 'Long document content here...'" />
        <ToolFallbackResult result="Summary: This document discusses AI agent architectures." />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  ),
};

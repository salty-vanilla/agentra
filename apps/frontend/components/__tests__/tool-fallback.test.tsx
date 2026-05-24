import type { ToolCallMessagePartStatus } from '@assistant-ui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ToolFallbackArgs,
  ToolFallbackContent,
  ToolFallbackError,
  ToolFallbackResult,
  ToolFallbackRoot,
  ToolFallbackTrigger,
} from '../assistant-ui/tool-fallback';

function BasicToolFallback({
  toolName = 'test_tool',
  defaultOpen = false,
  status = { type: 'complete' },
}: {
  toolName?: string;
  defaultOpen?: boolean;
  status?: ToolCallMessagePartStatus;
}) {
  return (
    <ToolFallbackRoot defaultOpen={defaultOpen}>
      <ToolFallbackTrigger toolName={toolName} status={status} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText='{"key": "value"}' />
        <ToolFallbackResult result="test result" />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
}

describe('ToolFallback', () => {
  it('renders tool name in the trigger', () => {
    render(<BasicToolFallback toolName="get_weather" />);
    expect(screen.getByText('get_weather', { exact: false })).toBeInTheDocument();
  });

  it('shows "Used tool" label for completed tool', () => {
    render(<BasicToolFallback status={{ type: 'complete' }} />);
    expect(screen.getAllByText('Used tool:', { exact: false })[0]).toBeInTheDocument();
  });

  it('hides content when collapsed (default)', () => {
    render(<BasicToolFallback />);
    expect(screen.queryByText('test result')).toBeNull();
  });

  it('shows content when defaultOpen is true', () => {
    render(<BasicToolFallback defaultOpen />);
    expect(screen.getByText('test result')).toBeInTheDocument();
  });

  it('expands on trigger click', async () => {
    render(<BasicToolFallback />);
    const trigger = screen.getByRole('button', { name: /test_tool/i });
    await userEvent.click(trigger);
    expect(screen.getByText('test result')).toBeInTheDocument();
  });

  it('shows "Cancelled tool" label for cancelled status', () => {
    render(
      <ToolFallbackRoot>
        <ToolFallbackTrigger
          toolName="task"
          status={{ type: 'incomplete', reason: 'cancelled' }}
        />
      </ToolFallbackRoot>,
    );
    expect(screen.getByText('Cancelled tool:', { exact: false })).toBeInTheDocument();
  });

  it('renders error message when status is incomplete with error', () => {
    render(
      <ToolFallbackRoot defaultOpen>
        <ToolFallbackTrigger
          toolName="task"
          status={{ type: 'incomplete', reason: 'error', error: 'Something went wrong' }}
        />
        <ToolFallbackContent>
          <ToolFallbackError
            status={{
              type: 'incomplete',
              reason: 'error',
              error: 'Something went wrong',
            }}
          />
        </ToolFallbackContent>
      </ToolFallbackRoot>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not render ToolFallbackArgs when argsText is undefined', () => {
    const { container } = render(
      <ToolFallbackRoot defaultOpen>
        <ToolFallbackTrigger toolName="task" />
        <ToolFallbackContent>
          <ToolFallbackArgs />
        </ToolFallbackContent>
      </ToolFallbackRoot>,
    );
    expect(container.querySelector('[data-slot="tool-fallback-args"]')).toBeNull();
  });
});

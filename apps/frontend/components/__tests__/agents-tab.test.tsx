import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentsTab } from '@/components/admin/agents-tab';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('@/components/ui/data-table', () => ({
  DataTable: ({
    data,
    onRowClick,
    emptyMessage,
  }: {
    data: Record<string, unknown>[];
    onRowClick?: (row: Record<string, unknown>) => void;
    emptyMessage?: string;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 ? (
        <span>{emptyMessage ?? 'この期間のデータはありません。'}</span>
      ) : (
        data.map((row, i) => (
          <button key={i} type="button" onClick={() => onRowClick?.(row)}>
            {String(row.agentName)}
          </button>
        ))
      )}
    </div>
  ),
}));

const chatAgent = {
  agentName: 'ChatAgent',
  callCount: 10,
  successRate: 0.9,
  errorRate: 0.1,
  avgDurationMs: 500,
  totalTokens: 5000,
  relatedTools: ['web_search', 'run_code'],
};

const codeAgent = {
  agentName: 'CodeAgent',
  callCount: 5,
  successRate: 0.8,
  errorRate: 0.2,
  avgDurationMs: 800,
  totalTokens: 3000,
  relatedTools: ['run_code'],
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { agents: [chatAgent, codeAgent] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return render(<AgentsTab from="2026-05-01" to="2026-05-25" />);
}

describe('AgentsTab', () => {
  it('renders all agents when search is empty', () => {
    setup();
    expect(screen.getByText('ChatAgent')).toBeInTheDocument();
    expect(screen.getByText('CodeAgent')).toBeInTheDocument();
  });

  it('filters rows by agent name', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'chat');
    expect(screen.getByText('ChatAgent')).toBeInTheDocument();
    expect(screen.queryByText('CodeAgent')).not.toBeInTheDocument();
  });

  it('restores all rows after clearing the search', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'chat');
    await user.click(screen.getByRole('button', { name: /検索条件をクリア/ }));
    expect(screen.getByText('ChatAgent')).toBeInTheDocument();
    expect(screen.getByText('CodeAgent')).toBeInTheDocument();
  });

  it('shows empty state when no rows match', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    expect(
      screen.getByText('検索に一致するエージェントはいません。'),
    ).toBeInTheDocument();
  });

  it('opens AgentDetailDrawer when a row is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('ChatAgent'));
    expect(screen.getByText('エージェント詳細')).toBeInTheDocument();
  });
});

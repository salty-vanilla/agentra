import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UsersTab } from '@/components/admin/users-tab';

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
    <div>
      {data.length === 0 ? (
        <span>{emptyMessage ?? 'No data for this period.'}</span>
      ) : (
        data.map((row, i) => (
          <button key={i} type="button" onClick={() => onRowClick?.(row)}>
            {String(row.userId)}
          </button>
        ))
      )}
    </div>
  ),
}));

const alice = {
  userId: 'alice-0000-0000-0000-000000000001',
  requestCount: 5,
  totalTokens: 1000,
  avgDurationMs: 500,
  errorRate: 0.1,
  mostUsedAgent: 'ChatAgent',
  mostUsedTool: 'web_search',
};

const bob = {
  userId: 'bob-0000-0000-0000-000000000002',
  requestCount: 3,
  totalTokens: 600,
  avgDurationMs: 300,
  errorRate: 0,
  mostUsedAgent: 'CodeAgent',
  mostUsedTool: 'run_code',
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { users: [alice, bob] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return render(<UsersTab from="2026-05-01" to="2026-05-25" />);
}

describe('UsersTab', () => {
  it('renders all users when search is empty', () => {
    setup();
    expect(screen.getByText(alice.userId)).toBeInTheDocument();
    expect(screen.getByText(bob.userId)).toBeInTheDocument();
  });

  it('filters rows by userId', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'alice');
    expect(screen.getByText(alice.userId)).toBeInTheDocument();
    expect(screen.queryByText(bob.userId)).not.toBeInTheDocument();
  });

  it('restores all rows after clearing the search', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'alice');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText(alice.userId)).toBeInTheDocument();
    expect(screen.getByText(bob.userId)).toBeInTheDocument();
  });

  it('shows empty state when no rows match', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    expect(screen.getByText('No users match the search.')).toBeInTheDocument();
  });

  it('opens UserDetailDrawer when a row is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText(alice.userId));
    expect(screen.getByText('User Detail')).toBeInTheDocument();
  });
});

import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UsersTab } from '@/components/admin/users-tab';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('@/components/ui/data-table', () => ({
  DataTable: ({
    data,
    columns,
    onRowClick,
    emptyMessage,
    emptyAction,
  }: {
    data: Record<string, unknown>[];
    columns: {
      accessorKey?: string;
      header?: unknown;
      meta?: { align?: string };
      cell?: (context: { getValue: () => unknown }) => ReactNode;
    }[];
    onRowClick?: (row: Record<string, unknown>) => void;
    emptyMessage?: string;
    emptyAction?: ReactNode;
  }) => {
    const columnLabel = (column: { accessorKey?: string; header?: unknown }) =>
      typeof column.header === 'string'
        ? column.header
        : (column.accessorKey ?? 'column');
    const errorRateColumn = columns.find((column) => columnLabel(column) === 'エラー率');

    return (
      <div>
        {columns.map((column) => (
          <span
            key={columnLabel(column)}
            data-testid={`column-align-${columnLabel(column).replaceAll(' ', '-')}`}
            data-align={column.meta?.align ?? 'left'}
          />
        ))}
        {data.length === 0 ? (
          <>
            <span>{emptyMessage ?? 'この期間のデータはありません。'}</span>
            {emptyAction}
          </>
        ) : (
          <>
            {data.map((row, i) => (
              <button key={i} type="button" onClick={() => onRowClick?.(row)}>
                {String(row.userId)}
              </button>
            ))}
            {errorRateColumn
              ? data.map((row, i) => (
                  <div key={i} data-testid={`error-rate-cell-${i}`}>
                    {errorRateColumn.cell?.({
                      getValue: () => row[errorRateColumn.accessorKey ?? ''],
                    }) ?? String(row[errorRateColumn.accessorKey ?? ''])}
                  </div>
                ))
              : null}
          </>
        )}
      </div>
    );
  },
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

const charlie = {
  userId: 'charlie-0000-0000-0000-000000000003',
  requestCount: 9,
  totalTokens: 1200,
  avgDurationMs: 900,
  errorRate: 0.333,
  mostUsedAgent: 'ResearchAgent',
  mostUsedTool: 'kb_search',
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { users: [alice, bob, charlie] },
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
    await user.click(screen.getByRole('button', { name: /検索条件をクリア/ }));
    expect(screen.getByText(alice.userId)).toBeInTheDocument();
    expect(screen.getByText(bob.userId)).toBeInTheDocument();
  });

  it('shows empty state with a clear-search action when no rows match', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    expect(screen.getByText('検索に一致するユーザーはいません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '検索をクリア' })).toBeInTheDocument();
  });

  it('clearing the search from the empty state restores all rows', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    await user.click(screen.getByRole('button', { name: '検索をクリア' }));
    expect(screen.getByText(alice.userId)).toBeInTheDocument();
    expect(screen.getByText(bob.userId)).toBeInTheDocument();
  });

  it('opens UserDetailDrawer when a row is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText(alice.userId));
    expect(screen.getByText('ユーザー詳細')).toBeInTheDocument();
  });

  it('marks numeric columns for right alignment', () => {
    setup();

    for (const header of ['リクエスト', 'トークン', '平均時間', 'エラー率']) {
      expect(
        screen.getByTestId(`column-align-${header.replaceAll(' ', '-')}`),
      ).toHaveAttribute('data-align', 'right');
    }
    expect(screen.getByTestId('column-align-上位エージェント')).toHaveAttribute(
      'data-align',
      'left',
    );
  });

  it('renders semantic text tiers for warning and destructive error rates', () => {
    setup();

    expect(screen.getByText('10.0%')).toHaveClass(
      'text-amber-700',
      'dark:text-amber-300',
    );
    expect(screen.getByText('33.3%')).toHaveClass('text-destructive');
    expect(screen.getByText('0.0%')).not.toHaveClass(
      'text-amber-700',
      'text-destructive',
    );
  });
});

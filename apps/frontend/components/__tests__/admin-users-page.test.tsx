import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUsersPage } from '@/components/admin/admin-users-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      error: null,
      isError: false,
      isPending: false,
      mutate: vi.fn(),
      reset: vi.fn(),
    })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

vi.mock('@/components/ui/data-table', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    emptyAction,
  }: {
    data: Record<string, unknown>[];
    columns: {
      accessorKey?: string;
      header?: unknown;
      meta?: { align?: string };
    }[];
    emptyMessage?: string;
    emptyAction?: ReactNode;
  }) => {
    const columnLabel = (column: { accessorKey?: string; header?: unknown }) =>
      typeof column.header === 'string'
        ? column.header
        : (column.accessorKey ?? 'column');

    return (
      <div data-testid="data-table">
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
          data.map((row, i) => (
            <span key={i} data-testid="data-row">
              {String(row.email)}
            </span>
          ))
        )}
      </div>
    );
  },
}));

vi.mock('@/lib/use-current-user-sub', () => ({
  useCurrentUserSub: () => 'sub-current-user',
}));

const adminUser = {
  userId: 'user-admin-001',
  sub: 'sub-admin-001',
  email: 'admin@example.com',
  role: 'admin',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  requestCount: 42,
  totalTokens: 15000,
  errorRate: 0.02,
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { users: [adminUser] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return render(<AdminUsersPage />);
}

describe('AdminUsersPage', () => {
  it('marks the request count column for right alignment', () => {
    setup();

    expect(screen.getByTestId('column-align-リクエスト')).toHaveAttribute(
      'data-align',
      'right',
    );
    expect(screen.getByTestId('column-align-メールアドレス')).toHaveAttribute(
      'data-align',
      'left',
    );
  });

  it('offers a clear-filter action when a search matches no users', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByPlaceholderText('メールアドレス、User ID、Sub、ロールで検索...'),
      'zzz-no-such-user-zzz',
    );

    expect(screen.getByText('条件に一致するユーザーはいません。')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'フィルターをクリア' }),
    ).toBeInTheDocument();
  });

  it('clearing the filter restores the user row', async () => {
    const user = userEvent.setup();
    setup();

    const search = screen.getByPlaceholderText(
      'メールアドレス、User ID、Sub、ロールで検索...',
    );
    await user.type(search, 'zzz-no-such-user-zzz');
    await user.click(screen.getByRole('button', { name: 'フィルターをクリア' }));

    expect(search).toHaveValue('');
    expect(screen.getByTestId('data-row')).toHaveTextContent('admin@example.com');
  });
});

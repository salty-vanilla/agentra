'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { AdminUserStats } from '@/lib/generated/model';
import { adminUsersQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';
import { UserDetailDrawer } from './user-detail-drawer';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminUserStats>();

const ERROR_RATE_WARNING_THRESHOLD = 0.1;
const ERROR_RATE_DESTRUCTIVE_THRESHOLD = 0.25;

function errorRateTextClassName(rate: number): string | undefined {
  if (rate >= ERROR_RATE_DESTRUCTIVE_THRESHOLD) return 'text-destructive';
  if (rate >= ERROR_RATE_WARNING_THRESHOLD) {
    return 'text-amber-700 dark:text-amber-300';
  }
  return undefined;
}

const columns = [
  helper.accessor('userId', {
    header: 'User ID',
    size: 200,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('role', {
    header: 'Role',
    size: 90,
    cell: ({ getValue }) => {
      const role = getValue<'admin' | 'user' | undefined>() ?? 'user';
      return (
        <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
          {role === 'admin' ? 'Admin' : 'User'}
        </Badge>
      );
    },
  }),
  helper.accessor('requestCount', {
    header: 'Requests',
    size: 100,
    meta: { align: 'right' },
  }),
  helper.accessor('totalTokens', {
    header: 'Tokens',
    size: 120,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
    meta: { align: 'right' },
  }),
  helper.accessor('avgDurationMs', {
    header: 'Avg Duration',
    size: 120,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
    meta: { align: 'right' },
  }),
  helper.accessor('errorRate', {
    header: 'Error Rate',
    size: 100,
    cell: ({ getValue }) => {
      const rate = getValue<number>();
      return (
        <span className={errorRateTextClassName(rate)}>{(rate * 100).toFixed(1)}%</span>
      );
    },
    meta: { align: 'right' },
  }),
  helper.accessor('mostUsedAgent', {
    header: 'Top Agent',
    size: 150,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '—',
  }),
  helper.accessor('mostUsedTool', {
    header: 'Top Tool',
    size: 150,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '—',
  }),
];

function filterUsers(users: AdminUserStats[], query: string): AdminUserStats[] {
  if (!query) return users;
  const q = query.toLowerCase();
  return users.filter(
    (u) =>
      u.userId.toLowerCase().includes(q) ||
      (u.role ?? 'user').toLowerCase().includes(q) ||
      (u.mostUsedAgent?.toLowerCase().includes(q) ?? false) ||
      (u.mostUsedTool?.toLowerCase().includes(q) ?? false),
  );
}

export function UsersTab({ from, to }: Props) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUserStats[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUserStats | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: from/to are intentional triggers — period change resets pagination
  useEffect(() => {
    setCursor(undefined);
    setAllUsers([]);
  }, [from, to]);

  const { data, isLoading, error } = useQuery({
    ...adminUsersQueryOptions({
      from,
      to,
      limit: 50,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
    placeholderData: (prev) => prev,
  });

  const users = useMemo(
    () => [...allUsers, ...(data?.users ?? [])],
    [allUsers, data?.users],
  );

  const filteredUsers = useMemo(() => filterUsers(users, search), [users, search]);

  function loadMore() {
    if (data?.cursor) {
      setAllUsers((prev) => [...prev, ...(data?.users ?? [])]);
      setCursor(data.cursor);
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by user ID, role, top agent, or top tool..."
          className="w-full sm:w-72"
        />
      </div>
      <DataTable
        data={filteredUsers}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load users.' : null}
        emptyMessage={search ? 'No users match the search.' : 'No data for this period.'}
        onRowClick={(user) => setSelected(user)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            Load more
          </Button>
        </div>
      )}
      <UserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

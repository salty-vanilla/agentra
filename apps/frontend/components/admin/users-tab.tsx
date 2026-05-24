'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { AdminUserStats } from '@/lib/generated/model';
import { adminUsersQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminUserStats>();

const columns = [
  helper.accessor('userId', {
    header: 'User ID',
    size: 200,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('requestCount', { header: 'Requests', size: 100 }),
  helper.accessor('totalTokens', {
    header: 'Tokens',
    size: 120,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  }),
  helper.accessor('avgDurationMs', {
    header: 'Avg Duration',
    size: 120,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('errorRate', {
    header: 'Error Rate',
    size: 100,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
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

export function UsersTab({ from, to }: Props) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUserStats[]>([]);

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
    () =>
      cursor === undefined ? (data?.users ?? []) : [...allUsers, ...(data?.users ?? [])],
    [cursor, data?.users, allUsers],
  );

  function loadMore() {
    if (data?.cursor) {
      setAllUsers(users);
      setCursor(data.cursor);
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <DataTable
        data={users}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load users.' : null}
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
    </div>
  );
}

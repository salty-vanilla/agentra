'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AdminUserStats } from '@/lib/generated/model';
import { adminUsersQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

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

  const users =
    cursor === undefined ? (data?.users ?? []) : [...allUsers, ...(data?.users ?? [])];

  function loadMore() {
    if (data?.cursor) {
      setAllUsers(users);
      setCursor(data.cursor);
    }
  }

  if (isLoading && !cursor) {
    return <div className="text-muted-foreground text-sm">Loading users...</div>;
  }

  if (error) {
    return <div className="text-destructive text-sm">Failed to load users.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                'User ID',
                'Requests',
                'Tokens',
                'Avg Duration',
                'Error Rate',
                'Top Agent',
                'Top Tool',
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t hover:bg-muted/50">
                <td className="px-3 py-2 font-mono text-xs">{u.userId.slice(0, 16)}…</td>
                <td className="px-3 py-2">{u.requestCount}</td>
                <td className="px-3 py-2">{u.totalTokens.toLocaleString()}</td>
                <td className="px-3 py-2">{u.avgDurationMs}ms</td>
                <td className="px-3 py-2">{(u.errorRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">{u.mostUsedAgent ?? '—'}</td>
                <td className="px-3 py-2">{u.mostUsedTool ?? '—'}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No data for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data?.cursor && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
          Load more
        </Button>
      )}
    </div>
  );
}

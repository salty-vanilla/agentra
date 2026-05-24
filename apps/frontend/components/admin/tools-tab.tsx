'use client';

import { useQuery } from '@tanstack/react-query';
import { adminToolsQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

export function ToolsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminToolsQueryOptions({ from, to }));

  if (isLoading)
    return <div className="text-muted-foreground text-sm">Loading tools...</div>;
  if (error) return <div className="text-destructive text-sm">Failed to load tools.</div>;

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {['Tool', 'Calls', 'Failure Rate', 'Avg Duration', 'Last Error'].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data?.tools ?? []).map((t) => (
            <tr key={t.toolName} className="border-t hover:bg-muted/50">
              <td className="px-3 py-2 font-medium">{t.toolName}</td>
              <td className="px-3 py-2">{t.callCount}</td>
              <td className="px-3 py-2">{(t.failureRate * 100).toFixed(1)}%</td>
              <td className="px-3 py-2">{t.avgDurationMs}ms</td>
              <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                {t.lastError ?? '—'}
              </td>
            </tr>
          ))}
          {(data?.tools ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

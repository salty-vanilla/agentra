'use client';

import { useQuery } from '@tanstack/react-query';
import { adminAgentsQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

export function AgentsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminAgentsQueryOptions({ from, to }));

  if (isLoading)
    return <div className="text-muted-foreground text-sm">Loading agents...</div>;
  if (error)
    return <div className="text-destructive text-sm">Failed to load agents.</div>;

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {[
              'Agent',
              'Calls',
              'Success Rate',
              'Error Rate',
              'Avg Duration',
              'Tokens',
              'Related Tools',
            ].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data?.agents ?? []).map((a) => (
            <tr key={a.agentName} className="border-t hover:bg-muted/50">
              <td className="px-3 py-2 font-medium">{a.agentName}</td>
              <td className="px-3 py-2">{a.callCount}</td>
              <td className="px-3 py-2">{(a.successRate * 100).toFixed(1)}%</td>
              <td className="px-3 py-2">{(a.errorRate * 100).toFixed(1)}%</td>
              <td className="px-3 py-2">{a.avgDurationMs}ms</td>
              <td className="px-3 py-2">{a.totalTokens.toLocaleString()}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {a.relatedTools.join(', ') || '—'}
              </td>
            </tr>
          ))}
          {(data?.agents ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

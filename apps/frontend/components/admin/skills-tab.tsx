'use client';

import { useQuery } from '@tanstack/react-query';
import { adminSkillsQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

export function SkillsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminSkillsQueryOptions({ from, to }));

  if (isLoading)
    return <div className="text-muted-foreground text-sm">Loading skills...</div>;
  if (error)
    return <div className="text-destructive text-sm">Failed to load skills.</div>;

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {['Skill', 'Requests', 'Avg Duration', 'Tokens', 'Error Rate'].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data?.skills ?? []).map((s) => (
            <tr key={s.skillName} className="border-t hover:bg-muted/50">
              <td className="px-3 py-2 font-medium">{s.skillName}</td>
              <td className="px-3 py-2">{s.requestCount}</td>
              <td className="px-3 py-2">{s.avgDurationMs}ms</td>
              <td className="px-3 py-2">{s.totalTokens.toLocaleString()}</td>
              <td className="px-3 py-2">{(s.errorRate * 100).toFixed(1)}%</td>
            </tr>
          ))}
          {(data?.skills ?? []).length === 0 && (
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

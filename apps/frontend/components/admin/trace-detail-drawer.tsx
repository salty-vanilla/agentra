'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type {
  AdminTraceAgentCall,
  AdminTraceSkillCall,
  AdminTraceToolCall,
} from '@/lib/generated/model';
import { adminTraceDetailQueryOptions } from '@/lib/query-options';

type Props = {
  traceId: string | null;
  onClose: () => void;
};

type CallKind = 'tool' | 'agent' | 'skill';

type TimelineEntry =
  | { kind: 'tool'; data: AdminTraceToolCall }
  | { kind: 'agent'; data: AdminTraceAgentCall }
  | { kind: 'skill'; data: AdminTraceSkillCall };

function statusVariant(status?: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'success') return 'default';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

function callLabel(entry: TimelineEntry): string {
  if (entry.kind === 'tool') return entry.data.toolName;
  if (entry.kind === 'agent') return entry.data.agentName;
  return entry.data.skillName;
}

function callStatus(entry: TimelineEntry): string | undefined {
  if (entry.kind === 'tool') return entry.data.status;
  if (entry.kind === 'agent') return entry.data.status;
  return entry.data.status;
}

function callDuration(entry: TimelineEntry): number | undefined {
  if (entry.kind === 'tool') return entry.data.durationMs;
  if (entry.kind === 'agent') return entry.data.durationMs;
  return entry.data.durationMs;
}

function callError(entry: TimelineEntry): string | undefined {
  if (entry.kind === 'tool') return entry.data.error;
  return undefined;
}

function kindBadgeClass(kind: CallKind): string {
  if (kind === 'tool')
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (kind === 'agent')
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
}

function buildTimeline(
  toolCalls: AdminTraceToolCall[],
  agentCalls: AdminTraceAgentCall[],
  skillCalls: AdminTraceSkillCall[],
): TimelineEntry[] {
  const tools: TimelineEntry[] = toolCalls.map((d) => ({
    kind: 'tool' as const,
    data: d,
  }));
  const agents: TimelineEntry[] = agentCalls.map((d) => ({
    kind: 'agent' as const,
    data: d,
  }));
  const skills: TimelineEntry[] = skillCalls.map((d) => ({
    kind: 'skill' as const,
    data: d,
  }));

  return [...tools, ...agents, ...skills].sort((a, b) => {
    const aTime = a.kind !== 'skill' ? (a.data.startedAt ?? '') : '';
    const bTime = b.kind !== 'skill' ? (b.data.startedAt ?? '') : '';
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });
}

export function TraceDetailDrawer({ traceId, onClose }: Props) {
  const { data, isLoading, error } = useQuery(adminTraceDetailQueryOptions(traceId));

  const detail = data?.trace;

  return (
    <Sheet open={traceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Trace Detail</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="px-4 text-muted-foreground text-sm">Loading...</div>
        )}
        {error && (
          <div className="px-4 text-destructive text-sm">Failed to load trace.</div>
        )}

        {detail && (
          <div className="px-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Trace ID</span>
              <span className="font-mono text-xs break-all">{detail.traceId}</span>
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs break-all">{detail.userId}</span>
              <span className="text-muted-foreground">Request ID</span>
              <span className="font-mono text-xs break-all">{detail.requestId}</span>
              <span className="text-muted-foreground">Thread ID</span>
              <span className="font-mono text-xs break-all">{detail.threadId}</span>
              <span className="text-muted-foreground">Status</span>
              <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
              <span className="text-muted-foreground">Duration</span>
              <span>{detail.durationMs}ms</span>
              <span className="text-muted-foreground">Model</span>
              <span>{detail.model ?? '—'}</span>
              <span className="text-muted-foreground">Tokens</span>
              <span>{detail.totalTokens?.toLocaleString() ?? '—'}</span>
              <span className="text-muted-foreground">Est. Cost</span>
              <span>
                {detail.estimatedCostUsd != null
                  ? `$${detail.estimatedCostUsd.toFixed(5)}`
                  : '—'}
              </span>
              {detail.tokenUsage && (
                <>
                  <span className="text-muted-foreground">Input tokens</span>
                  <span>{detail.tokenUsage.inputTokens}</span>
                  <span className="text-muted-foreground">Output tokens</span>
                  <span>{detail.tokenUsage.outputTokens}</span>
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Timeline</h3>
              <div className="space-y-2">
                {buildTimeline(
                  detail.toolCalls,
                  detail.agentCalls,
                  detail.skillCalls,
                ).map((entry, i) => {
                  const status = callStatus(entry);
                  const duration = callDuration(entry);
                  const err = callError(entry);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm border rounded px-3 py-2"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(entry.kind)}`}
                      >
                        {entry.kind}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{callLabel(entry)}</div>
                        {err && (
                          <div className="text-xs text-destructive truncate">{err}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {duration != null && (
                          <span className="text-xs text-muted-foreground">
                            {duration}ms
                          </span>
                        )}
                        {status && (
                          <Badge variant={statusVariant(status)} className="text-xs">
                            {status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {detail.toolCalls.length === 0 &&
                  detail.agentCalls.length === 0 &&
                  detail.skillCalls.length === 0 && (
                    <div className="text-muted-foreground text-sm">
                      No sub-calls recorded.
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

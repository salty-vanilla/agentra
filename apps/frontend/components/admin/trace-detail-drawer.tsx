'use client';

import { useQuery } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatTraceCallKind, formatTraceStatus } from '@/lib/admin-labels';
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

function statusVariant(status?: string): 'success' | 'destructive' | 'secondary' {
  if (status === 'success') return 'success';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

function callLabel(entry: TimelineEntry): string {
  if (entry.kind === 'tool') return entry.data.toolName;
  if (entry.kind === 'agent') return entry.data.agentName;
  return entry.data.skillName;
}

function callStatus(entry: TimelineEntry): string | undefined {
  return entry.data.status;
}

function callDuration(entry: TimelineEntry): number | undefined {
  return entry.data.durationMs;
}

function callError(entry: TimelineEntry): string | undefined {
  if (entry.kind === 'tool') return entry.data.error;
  return undefined;
}

function callStartedAt(entry: TimelineEntry): string | undefined {
  if (entry.kind === 'tool') return entry.data.startedAt;
  if (entry.kind === 'agent') return entry.data.startedAt;
  return undefined;
}

function kindBadgeClass(kind: CallKind): string {
  if (kind === 'tool')
    return 'border border-border bg-secondary text-secondary-foreground';
  if (kind === 'agent') return 'border border-border bg-background text-foreground';
  return 'border border-border bg-muted text-muted-foreground';
}

function formatRelativeMs(diffMs: number): string {
  if (diffMs < 1000) return `+${diffMs}ms`;
  return `+${(diffMs / 1000).toFixed(1)}s`;
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

function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      aria-label={`${label}をコピー`}
      onClick={() => {
        navigator.clipboard.writeText(value).catch((err) => {
          console.warn(`${label}のコピーに失敗しました`, err);
        });
      }}
      className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground"
    >
      <CopyIcon className="size-3" />
    </button>
  );
}

export function TraceDetailDrawer({ traceId, onClose }: Props) {
  const { data, isLoading, error } = useQuery(adminTraceDetailQueryOptions(traceId));

  const detail = data?.trace;

  return (
    <Sheet open={traceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>トレース詳細</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="px-4 text-muted-foreground text-sm">読み込み中...</div>
        )}
        {error && (
          <div className="px-4 text-destructive text-sm">
            トレースの読み込みに失敗しました。
          </div>
        )}

        {detail && (
          <div className="px-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Trace ID</span>
              <span className="font-mono text-xs break-all flex items-center">
                {detail.traceId}
                <CopyButton label="Trace ID" value={detail.traceId} />
              </span>
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs break-all flex items-center">
                {detail.userId}
                <CopyButton label="User ID" value={detail.userId} />
              </span>
              <span className="text-muted-foreground">Request ID</span>
              <span className="font-mono text-xs break-all flex items-center">
                {detail.requestId}
                <CopyButton label="Request ID" value={detail.requestId} />
              </span>
              <span className="text-muted-foreground">Thread ID</span>
              <span className="font-mono text-xs break-all flex items-center">
                {detail.threadId}
                <CopyButton label="Thread ID" value={detail.threadId} />
              </span>
              <span className="text-muted-foreground">状態</span>
              <Badge variant={statusVariant(detail.status)}>
                {formatTraceStatus(detail.status)}
              </Badge>
              <span className="text-muted-foreground">所要時間</span>
              <span>{detail.durationMs}ms</span>
              <span className="text-muted-foreground">モデル</span>
              <span>{detail.model ?? '—'}</span>
              <span className="text-muted-foreground">トークン</span>
              <span>{detail.totalTokens?.toLocaleString() ?? '—'}</span>
              <span className="text-muted-foreground">概算コスト</span>
              <span>
                {detail.estimatedCostUsd != null
                  ? `$${detail.estimatedCostUsd.toFixed(5)}`
                  : '—'}
              </span>
              {detail.tokenUsage && (
                <>
                  <span className="text-muted-foreground">入力トークン</span>
                  <span>{detail.tokenUsage.inputTokens}</span>
                  <span className="text-muted-foreground">出力トークン</span>
                  <span>{detail.tokenUsage.outputTokens}</span>
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">タイムライン</h3>
              <div className="space-y-2">
                {buildTimeline(
                  detail.toolCalls,
                  detail.agentCalls,
                  detail.skillCalls,
                ).map((entry, i) => {
                  const status = callStatus(entry);
                  const duration = callDuration(entry);
                  const err = callError(entry);
                  const entryStartedAt = callStartedAt(entry);
                  const rawRelativeMs = entryStartedAt
                    ? new Date(entryStartedAt).getTime() -
                      new Date(detail.startedAt).getTime()
                    : null;
                  const relativeMs =
                    rawRelativeMs !== null && Number.isFinite(rawRelativeMs)
                      ? rawRelativeMs
                      : null;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(entry.kind)}`}
                      >
                        {formatTraceCallKind(entry.kind)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{callLabel(entry)}</div>
                        {err && (
                          <div className="text-xs text-destructive break-words">
                            {err}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {relativeMs !== null && (
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeMs(relativeMs)}
                          </span>
                        )}
                        {relativeMs === null && entryStartedAt === undefined && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {duration != null && (
                          <span className="text-xs text-muted-foreground">
                            {duration}ms
                          </span>
                        )}
                        {status && (
                          <Badge variant={statusVariant(status)} className="text-xs">
                            {formatTraceStatus(status)}
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
                      サブ呼び出しは記録されていません。
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

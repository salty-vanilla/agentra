'use client';

import type { ChatObservationSummary } from '@agentra/shared';
import {
  AlertTriangleIcon,
  BotIcon,
  CheckIcon,
  Clock3Icon,
  CoinsIcon,
  FingerprintIcon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import {
  extractAgentInfo,
  formatDuration,
  formatToolLabel,
  sanitizeToolError,
} from '@/lib/observability-format';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  success: {
    icon: CheckIcon,
    label: '成功',
    className: 'text-green-600 dark:text-green-400',
  },
  partial_failure: {
    icon: AlertTriangleIcon,
    label: '一部失敗',
    className: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    icon: XCircleIcon,
    label: 'エラー',
    className: 'text-destructive',
  },
  cancelled: {
    icon: XIcon,
    label: 'キャンセル',
    className: 'text-muted-foreground',
  },
} as const;

type DisplayStatus = keyof typeof STATUS_CONFIG;

function resolveDisplayStatus(summary: ChatObservationSummary): DisplayStatus {
  if (summary.status === 'success' && summary.toolFailureCount > 0) {
    return 'partial_failure';
  }
  return summary.status in STATUS_CONFIG ? (summary.status as DisplayStatus) : 'success';
}

export interface ObservabilityDetailsViewProps {
  summary: ChatObservationSummary;
}

export function ObservabilityDetailsView({ summary }: ObservabilityDetailsViewProps) {
  const toolCalls = summary.toolCalls ?? [];
  const statusConfig = STATUS_CONFIG[resolveDisplayStatus(summary)];
  const StatusIcon = statusConfig.icon;

  const agentInfoList = toolCalls.flatMap((tc) => {
    const info = extractAgentInfo(tc.metadata as Record<string, unknown> | undefined);
    return info ? [info] : [];
  });
  const uniqueAgents = agentInfoList.filter(
    (agent, i, arr) => arr.findIndex((a) => a.agentName === agent.agentName) === i,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex items-center gap-2 font-medium text-foreground">
          <FingerprintIcon className="size-3.5" />
          Observability
        </div>
        <p
          className="max-w-[10rem] truncate text-muted-foreground"
          title={summary.traceId}
        >
          {summary.traceId}
        </p>
      </div>

      <div className={cn('inline-flex items-center gap-1.5', statusConfig.className)}>
        <StatusIcon className="size-3 shrink-0" />
        <span>{statusConfig.label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="inline-flex items-center gap-2">
          <Clock3Icon className="size-3.5 text-muted-foreground" />
          {formatDuration(summary.durationMs)}
          <span className="inline-flex items-center gap-1">
            <CoinsIcon className="size-3.5 text-muted-foreground" />
            {summary.tokenUsage != null
              ? summary.tokenUsage.totalTokens.toLocaleString()
              : 'n/a'}
          </span>
        </p>
        <p className="inline-flex items-center gap-2">
          <WrenchIcon className="size-3.5 text-muted-foreground" />
          {summary.toolCallCount} ツール
          {summary.toolFailureCount > 0 && (
            <span className="text-destructive">({summary.toolFailureCount} 失敗)</span>
          )}
        </p>
      </div>

      {toolCalls.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          {toolCalls.map((tool) => {
            const errorText = sanitizeToolError(tool.error);
            return (
              <div key={tool.toolCallId} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {tool.status === 'success' ? (
                    <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
                  ) : tool.status === 'cancelled' ? (
                    <XIcon className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <XCircleIcon className="size-3 shrink-0 text-destructive" />
                  )}
                  <span className={tool.status === 'error' ? 'text-destructive' : ''}>
                    {formatToolLabel(tool.toolName)}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {formatDuration(tool.durationMs)}
                  </span>
                </div>
                {errorText && (
                  <p className="pl-5 text-destructive/80 leading-tight">{errorText}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {uniqueAgents.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <BotIcon className="size-3.5" />
            エージェント
          </p>
          {uniqueAgents.map((agent) => (
            <div key={agent.agentName} className="pl-5">
              <span className="text-foreground">{agent.agentName}</span>
              {agent.agentKind && (
                <span className="ml-1.5 text-muted-foreground">({agent.agentKind})</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

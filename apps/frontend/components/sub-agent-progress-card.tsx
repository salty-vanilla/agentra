'use client';

import {
  CheckIcon,
  CogIcon,
  DatabaseIcon,
  GlobeIcon,
  LayoutIcon,
  Loader2Icon,
  SearchIcon,
  WrenchIcon,
  XCircleIcon,
  ZapIcon,
} from 'lucide-react';
import type { FC } from 'react';
import type { SubAgentProgressEvent } from '@/lib/generated/model';

const STAGE_LABELS: Record<string, string> = {
  kb_retrieve: 'KB 検索',
  structured_rag_flow: '構造化クエリ',
  structured_query_plan: '構造化クエリ計画',
  structured_query_execute_mock: '構造化クエリ実行',
  structured_answer_synthesis: '回答統合',
  kb_answer_synthesis: 'KB 回答統合',
  web_research: 'Webリサーチ',
  router: 'リクエスト処理',
  manufacturing_line: '製造ラインデータ分析',
  create_slide: 'スライド生成',
};

export const SubAgentProgressCard: FC<{
  events: SubAgentProgressEvent[];
}> = ({ events }) => {
  if (events.length === 0) return null;

  const hasError = events.some((event) => event.status === 'error');
  const hasRunning = events.some((event) => event.status === 'running');

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <WrenchIcon className="h-4 w-4" />
        <span>
          {hasError
            ? 'サブエージェントでエラーが発生しました'
            : hasRunning
              ? 'サブエージェント実行中'
              : 'サブエージェント完了'}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {events.map((event) => (
          <div key={event.stage} className="flex gap-2">
            <div className="mt-0.5">
              <StatusIcon status={event.status} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
                <StageIcon stage={event.stage} />
                <span>{formatStageLabel(event.stage)}</span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[0.68rem] text-muted-foreground/80">
                  {formatStatus(event)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground/80">
                {formatStageSummary(event)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusIcon: FC<{ status: SubAgentProgressEvent['status'] }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />;
    case 'error':
      return <XCircleIcon className="h-4 w-4 text-destructive" />;
    default:
      return <CheckIcon className="h-4 w-4 text-muted-foreground" />;
  }
};

const StageIcon: FC<{ stage: string }> = ({ stage }) => {
  if (stage === 'web_research' || stage.includes('web')) {
    return <GlobeIcon className="h-3.5 w-3.5" />;
  }
  if (stage === 'router') {
    return <ZapIcon className="h-3.5 w-3.5" />;
  }
  if (stage === 'manufacturing_line') {
    return <CogIcon className="h-3.5 w-3.5" />;
  }
  if (stage === 'create_slide' || stage.includes('slide')) {
    return <LayoutIcon className="h-3.5 w-3.5" />;
  }
  if (stage.includes('kb')) {
    return <SearchIcon className="h-3.5 w-3.5" />;
  }
  if (stage.includes('structured')) {
    return <DatabaseIcon className="h-3.5 w-3.5" />;
  }
  return <WrenchIcon className="h-3.5 w-3.5" />;
};

function formatStageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage] ??
    stage
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function formatStatus(event: SubAgentProgressEvent): string {
  switch (event.status) {
    case 'running':
      return '実行中';
    case 'error':
      return event.durationMs !== undefined
        ? `エラー (${formatDuration(event.durationMs)})`
        : 'エラー';
    default:
      return event.durationMs !== undefined
        ? `完了 ${formatDuration(event.durationMs)}`
        : '完了';
  }
}

function formatStageSummary(event: SubAgentProgressEvent): string {
  switch (event.status) {
    case 'running':
      return `${formatStageLabel(event.stage)}を実行しています。`;
    case 'error':
      return `${formatStageLabel(event.stage)}で問題が発生しました。`;
    default:
      return `${formatStageLabel(event.stage)}が完了しました。`;
  }
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '0ms';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

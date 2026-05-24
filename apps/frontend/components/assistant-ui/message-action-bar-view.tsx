'use client';

import type { ChatObservationSummary } from '@agentra/shared';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FingerprintIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { ObservabilityDetailsView } from '@/components/assistant-ui/observability-details-view';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface MessageActionBarViewProps {
  isCopied: boolean;
  onCopy: () => void;
  /** Omit to hide the reload button */
  onReload?: () => void;
  hasSummary?: boolean;
  /** Required when hasSummary is true */
  observabilitySummary?: ChatObservationSummary;
  /** Omit to hide the export option in the More menu */
  onExportMarkdown?: () => void;
  className?: string;
}

export function MessageActionBarView({
  isCopied,
  onCopy,
  onReload,
  hasSummary,
  observabilitySummary,
  onExportMarkdown,
  className,
}: MessageActionBarViewProps) {
  return (
    <div
      className={cn(
        'aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground',
        className,
      )}
    >
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {isCopied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>

      {onReload !== undefined && (
        <TooltipIconButton tooltip="Refresh" onClick={onReload}>
          <RefreshCwIcon />
        </TooltipIconButton>
      )}

      {hasSummary && observabilitySummary && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <TooltipIconButton tooltip="Observability">
              <FingerprintIcon />
            </TooltipIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="z-50 w-[min(calc(100vw-2rem),22rem)] max-h-80 overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground text-xs shadow-md"
          >
            <ObservabilityDetailsView summary={observabilitySummary} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onExportMarkdown !== undefined && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <TooltipIconButton tooltip="More" aria-label="More">
              <MoreHorizontalIcon />
            </TooltipIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <Button
              variant="ghost"
              size="sm"
              className="aui-action-bar-more-item flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
              onClick={onExportMarkdown}
            >
              <DownloadIcon className="size-4" />
              Export as Markdown
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export interface BranchPickerViewProps {
  currentBranch: number;
  totalBranches: number;
  /** Omit to disable the previous button */
  onPrev?: () => void;
  /** Omit to disable the next button */
  onNext?: () => void;
  className?: string;
}

export function BranchPickerView({
  currentBranch,
  totalBranches,
  onPrev,
  onNext,
  className,
}: BranchPickerViewProps) {
  if (totalBranches <= 1) return null;

  return (
    <div
      className={cn(
        'aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs',
        className,
      )}
    >
      <TooltipIconButton
        tooltip="Previous"
        onClick={onPrev}
        disabled={onPrev === undefined}
      >
        <ChevronLeftIcon />
      </TooltipIconButton>
      <span className="aui-branch-picker-state font-medium">
        {currentBranch} / {totalBranches}
      </span>
      <TooltipIconButton tooltip="Next" onClick={onNext} disabled={onNext === undefined}>
        <ChevronRightIcon />
      </TooltipIconButton>
    </div>
  );
}

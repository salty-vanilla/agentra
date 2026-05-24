'use client';

import type { ChatObservationSummary } from '@agentra/shared';
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import { cva } from 'class-variance-authority';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FingerprintIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from 'lucide-react';
import type { FC } from 'react';
import { MarkdownText } from '@/components/assistant-ui/markdown-text';
import { ObservabilityDetailsView } from '@/components/assistant-ui/observability-details-view';
import { ToolFallback } from '@/components/assistant-ui/tool-fallback';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import { type ModelKey, ModelSelector } from '@/components/model-selector';
import { ProgressSummaryCard } from '@/components/progress-summary-card';
import { SlideCommandBadge } from '@/components/slide-command-badge';
import { SlideCommandDialog } from '@/components/slide-command-dialog';
import { SubAgentProgressCard } from '@/components/sub-agent-progress-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isMockApiMode } from '@/lib/api-config';
import type {
  ChatCommand,
  ProgressSummaryEvent,
  SubAgentProgressEvent,
} from '@/lib/generated/model';
import { cn } from '@/lib/utils';

const threadMessageRootVariants = cva(
  'fade-in slide-in-from-bottom-1 animate-in duration-150',
  {
    variants: {
      role: {
        assistant: 'relative',
        user: 'grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 [&:where(>*)]:col-start-2',
      },
    },
    defaultVariants: {
      role: 'assistant',
    },
  },
);

const actionBarMoreItemVariants = cva(
  'aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
);

export const Thread: FC<{
  modelValue: ModelKey;
  onModelChange: (m: ModelKey) => void;
  slideCommandActive?: boolean;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;
  onSlideCommandDeactivate?: () => void;
  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;
  progressEvents?: ProgressSummaryEvent[];
  activeProgressPhase?: string;
  subAgentProgressEvents?: SubAgentProgressEvent[];
}> = ({
  modelValue,
  onModelChange,
  slideCommandActive,
  onSlideCommandActivate,
  onSlideCommandDeactivate,
  slideDialogOpen,
  onSlideDialogOpenChange,
  progressEvents,
  activeProgressPhase,
  subAgentProgressEvents,
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ['--thread-max-width' as string]: '44rem',
        ['--composer-radius' as string]: '24px',
        ['--composer-padding' as string]: '10px',
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-10 flex flex-col gap-y-8 empty:hidden"
          >
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mt-auto flex flex-col gap-3 overflow-visible rounded-t-(--composer-radius) bg-transparent pb-2 md:pb-3">
            {progressEvents && progressEvents.length > 0 && (
              <div className="mx-auto w-full max-w-(--thread-max-width) px-2">
                <ProgressSummaryCard
                  events={progressEvents}
                  {...(activeProgressPhase ? { activePhase: activeProgressPhase } : {})}
                />
              </div>
            )}
            {subAgentProgressEvents && subAgentProgressEvents.length > 0 && (
              <div className="mx-auto w-full max-w-(--thread-max-width) px-2">
                <SubAgentProgressCard events={subAgentProgressEvents} />
              </div>
            )}
            <ThreadScrollToBottom />
            <Composer
              modelValue={modelValue}
              onModelChange={onModelChange}
              {...(slideCommandActive != null ? { slideCommandActive } : {})}
              {...(onSlideCommandActivate ? { onSlideCommandActivate } : {})}
              {...(onSlideCommandDeactivate ? { onSlideCommandDeactivate } : {})}
              {...(slideDialogOpen != null ? { slideDialogOpen } : {})}
              {...(onSlideDialogOpenChange ? { onSlideDialogOpenChange } : {})}
            />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === 'user') return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={
        <TooltipIconButton
          tooltip="Scroll to bottom"
          variant="outline"
          className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
        />
      }
    >
      <ArrowDownIcon />
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root my-auto flex grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full max-w-2xl flex-col justify-center px-4">
          <p className="mb-4 font-semibold text-[0.7rem] tracking-[0.24em] text-teal-800/80 uppercase">
            Internal Agent Workspace
          </p>
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-3xl duration-200">
            Frontend foundation, ready for AgentCore
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-lg delay-75 duration-200">
            Hono backend の `/chat` SSE を使いながら、thread UI・message actions・composer
            を assistant-ui ベースに統合しています。
          </p>
        </div>
      </div>
    </div>
  );
};

const Composer: FC<{
  modelValue: ModelKey;
  onModelChange: (m: ModelKey) => void;
  slideCommandActive?: boolean;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;
  onSlideCommandDeactivate?: () => void;
  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;
}> = ({
  modelValue,
  onModelChange,
  slideCommandActive,
  onSlideCommandActivate,
  onSlideCommandDeactivate,
  slideDialogOpen,
  onSlideDialogOpenChange,
}) => {
  // Detect /slide prefix in live composer text
  const hasSlidePrefix = useAuiState((s) => /^\/slide(\s|$)/.test(s.composer.text));
  const showBadge = slideCommandActive || hasSlidePrefix;

  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <div
        data-slot="aui_composer-shell"
        className="flex w-full flex-col gap-1.5 rounded-(--composer-radius) border bg-card/90 p-(--composer-padding) shadow-sm backdrop-blur-sm transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20"
      >
        {showBadge && (
          <div className="px-1.5">
            <SlideCommandBadge
              {...(onSlideCommandDeactivate && slideCommandActive
                ? { onRemove: onSlideCommandDeactivate }
                : {})}
            />
          </div>
        )}
        <ComposerPrimitive.Input
          placeholder={
            showBadge
              ? 'スライドの依頼内容を入力してください'
              : '質問や次の実装指示を入力してください（/slide でスライド作成）'
          }
          className="aui-composer-input max-h-32 min-h-[1.75rem] w-full resize-none bg-transparent px-1.5 py-0.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <ComposerAction
          modelValue={modelValue}
          onModelChange={onModelChange}
          {...(onSlideCommandActivate ? { onSlideCommandActivate } : {})}
          {...(slideDialogOpen != null ? { slideDialogOpen } : {})}
          {...(onSlideDialogOpenChange ? { onSlideDialogOpenChange } : {})}
        />
      </div>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{
  modelValue: ModelKey;
  onModelChange: (m: ModelKey) => void;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;
  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;
}> = ({
  modelValue,
  onModelChange,
  onSlideCommandActivate,
  slideDialogOpen,
  onSlideDialogOpenChange,
}) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <SlideCommandDialog
          onSubmit={(params) => {
            onSlideCommandActivate?.(params);
          }}
          {...(slideDialogOpen != null ? { externalOpen: slideDialogOpen } : {})}
          {...(onSlideDialogOpenChange ? { onOpenChange: onSlideDialogOpenChange } : {})}
        />
        {!isMockApiMode && <ModelSelector value={modelValue} onChange={onModelChange} />}
      </div>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          render={
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-8 rounded-full"
              aria-label="Send message"
            />
          }
        >
          <ArrowUpIcon className="aui-composer-send-icon size-4" />
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel
          render={
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-8 rounded-full"
              aria-label="Stop generating"
            />
          }
        >
          <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = 'pt-1.5';
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className={threadMessageRootVariants({ role: 'assistant' })}
    >
      <div
        data-slot="aui_assistant-message-content"
        className="wrap-break-word px-2 text-foreground leading-relaxed"
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
          }}
        />
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn('ml-2 flex items-center', ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantObservabilityDetails: FC = () => {
  const summary = useAuiState((s) => {
    const custom = s.message.metadata.custom as
      | { observabilitySummary?: ChatObservationSummary }
      | undefined;
    if (custom?.observabilitySummary) {
      return custom.observabilitySummary;
    }

    for (const part of s.message.content) {
      if (part.type === 'data' && part.name === 'observability') {
        return part.data as ChatObservationSummary;
      }
    }
    return undefined;
  });

  if (!summary) {
    return <p className="text-muted-foreground">Observability data not available.</p>;
  }

  return <ObservabilityDetailsView summary={summary} />;
};

const AssistantActionBar: FC = () => {
  const isGenerating = useAuiState((s) => s.message.isLast && s.thread.isRunning);
  const hasSummary = useAuiState((s) => {
    const custom = s.message.metadata.custom as
      | { observabilitySummary?: ChatObservationSummary }
      | undefined;
    if (custom?.observabilitySummary) return true;
    return s.message.content.some((p) => p.type === 'data' && p.name === 'observability');
  });

  if (isGenerating) return null;

  return (
    <ActionBarPrimitive.Root className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground">
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}>
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Refresh" />}>
        <RefreshCwIcon />
      </ActionBarPrimitive.Reload>
      {hasSummary && (
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
            <AssistantObservabilityDetails />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger
          className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent data-[state=open]:bg-accent"
          aria-label="More"
        >
          <MoreHorizontalIcon />
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown
            render={
              <ActionBarMorePrimitive.Item className={actionBarMoreItemVariants()} />
            }
          >
            <DownloadIcon className="size-4" />
            Export as Markdown
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const hasSlideCommand = useAuiState((s) => {
    const custom = s.message.metadata.custom as { command?: ChatCommand } | undefined;
    return custom?.command?.type === 'create_slide_presentation';
  });

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className={threadMessageRootVariants({ role: 'user' })}
      data-role="user"
    >
      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden">
          {hasSlideCommand && (
            <span className="mr-1.5">
              <SlideCommandBadge />
            </span>
          )}
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit
        render={<TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4" />}
      >
        <PencilIcon />
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel render={<Button variant="ghost" size="sm" />}>
            Cancel
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send render={<Button size="sm" />}>
            Update
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs',
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}>
        <ChevronLeftIcon />
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}>
        <ChevronRightIcon />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

'use client';

import type { ChatObservationSummary } from '@agentra/shared';
import type { DataMessagePartComponent } from '@assistant-ui/react';
import {
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
import { ArrowDownIcon, PencilIcon } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  createContext,
  type FC,
  forwardRef,
  type MutableRefObject,
  useContext,
  useRef,
} from 'react';
import { ArtifactCard } from '@/components/artifact-card';
import { AssistantComposerAdapter } from '@/components/assistant-ui/assistant-composer-adapter';
import { MarkdownText } from '@/components/assistant-ui/markdown-text';
import {
  BranchPickerView,
  MessageActionBarView,
} from '@/components/assistant-ui/message-action-bar-view';
import {
  AssistantMessageView,
  UserMessageView,
} from '@/components/assistant-ui/message-view';
import { ToolFallback } from '@/components/assistant-ui/tool-fallback';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import type { ModelKey } from '@/components/model-selector';
import { ProgressSummaryCard } from '@/components/progress-summary-card';
import { SubAgentProgressCard } from '@/components/sub-agent-progress-card';
import { Button } from '@/components/ui/button';
import type {
  ArtifactManifest,
  ChatCommand,
  ProgressSummaryEvent,
  SubAgentProgressEvent,
} from '@/lib/generated/model';
import { cn } from '@/lib/utils';

const ThreadIdContext = createContext<string>('');

const ArtifactDataRenderer: DataMessagePartComponent = ({ data }) => {
  const threadId = useContext(ThreadIdContext);
  const manifest = data as ArtifactManifest;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {manifest.artifacts.map((artifact) => (
        <ArtifactCard key={artifact.id} artifact={artifact} threadId={threadId} />
      ))}
    </div>
  );
};

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

export const Thread: FC<{
  modelValue: ModelKey;
  onModelChange: (m: ModelKey) => void;
  threadId?: string;
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
  threadId = '',
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
    <ThreadIdContext.Provider value={threadId}>
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
              <ThreadPrimitive.Messages>
                {() => <ThreadMessage />}
              </ThreadPrimitive.Messages>
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
    </ThreadIdContext.Provider>
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
}> = (props) => {
  const hasSlidePrefix = useAuiState((s) => /^\/slide(\s|$)/.test(s.composer.text));
  return <AssistantComposerAdapter {...props} hasSlidePrefix={hasSlidePrefix} />;
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

// Derives observability summary from message state in a single selector so
// hasSummary and summary are always consistent (same state snapshot).
// biome-ignore lint/suspicious/noExplicitAny: state shape is typed by @assistant-ui/react
const selectObservabilitySummary = (s: any): ChatObservationSummary | undefined => {
  const custom = s.message.metadata.custom as
    | { observabilitySummary?: ChatObservationSummary }
    | undefined;
  if (custom?.observabilitySummary) return custom.observabilitySummary;
  for (const part of s.message.content as Array<{
    type: string;
    name?: string;
    data?: unknown;
  }>) {
    if (part.type === 'data' && part.name === 'observability') {
      return part.data as ChatObservationSummary;
    }
  }
  return undefined;
};

// Invisible bridge button: captures the onClick injected by assistant-ui primitives
// via the Radix Slot (render prop) mechanism and stores it in a mutable ref.
// Used to extract runtime action callbacks into plain function refs.
const CaptureButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    callbackRef: MutableRefObject<(() => void) | undefined>;
  }
>(({ callbackRef, onClick, ...rest }, ref) => {
  callbackRef.current = onClick as (() => void) | undefined;
  return (
    <button
      ref={ref}
      type="button"
      style={{ display: 'none' }}
      aria-hidden="true"
      tabIndex={-1}
      {...rest}
    />
  );
});
CaptureButton.displayName = 'CaptureButton';

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className={threadMessageRootVariants({ role: 'assistant' })}
    >
      <AssistantMessageView
        errorContent={<MessageError />}
        footer={
          <>
            <BranchPicker />
            <AssistantActionBar />
          </>
        }
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
            data: { by_name: { artifact: ArtifactDataRenderer } },
          }}
        />
      </AssistantMessageView>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const isGenerating = useAuiState((s) => s.message.isLast && s.thread.isRunning);
  const isCopied = useAuiState((s) => s.message.isCopied);
  const summary = useAuiState(selectObservabilitySummary);

  const copyRef = useRef<(() => void) | undefined>(undefined);
  const reloadRef = useRef<(() => void) | undefined>(undefined);
  const exportRef = useRef<(() => void) | undefined>(undefined);

  if (isGenerating) return null;

  return (
    <>
      {/* Invisible bridge: ActionBarPrimitive.* writes onClick into refs via CaptureButton.
          Copy/Reload/ExportMarkdown have no context dependency on ActionBarPrimitive.Root. */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <ActionBarPrimitive.Copy render={<CaptureButton callbackRef={copyRef} />} />
        <ActionBarPrimitive.Reload render={<CaptureButton callbackRef={reloadRef} />} />
        <ActionBarPrimitive.ExportMarkdown
          render={<CaptureButton callbackRef={exportRef} />}
        />
      </div>
      <MessageActionBarView
        isCopied={isCopied}
        onCopy={() => {
          copyRef.current?.();
        }}
        onReload={() => {
          reloadRef.current?.();
        }}
        hasSummary={summary !== undefined}
        {...(summary !== undefined ? { observabilitySummary: summary } : {})}
        onExportMarkdown={() => {
          exportRef.current?.();
        }}
      />
    </>
  );
};

const BranchPicker: FC<{ className?: string; 'data-slot'?: string }> = ({
  className,
  ...rest
}) => {
  const currentBranch = useAuiState((s) => s.message.branchNumber);
  const totalBranches = useAuiState((s) => s.message.branchCount);

  const prevRef = useRef<(() => void) | undefined>(undefined);
  const nextRef = useRef<(() => void) | undefined>(undefined);

  return (
    <>
      {/* Invisible bridge: Previous/Next have no context dependency on BranchPickerPrimitive.Root. */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <BranchPickerPrimitive.Previous
          render={<CaptureButton callbackRef={prevRef} />}
        />
        <BranchPickerPrimitive.Next render={<CaptureButton callbackRef={nextRef} />} />
      </div>
      <BranchPickerView
        currentBranch={currentBranch}
        totalBranches={totalBranches}
        onPrev={() => {
          prevRef.current?.();
        }}
        onNext={() => {
          nextRef.current?.();
        }}
        className={cn(
          'aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs',
          className,
        )}
        {...rest}
      />
    </>
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
      <UserMessageView
        hasSlideCommand={hasSlideCommand}
        actionBar={<UserActionBar />}
        branchPicker={
          <BranchPicker
            data-slot="aui_user-branch-picker"
            className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
          />
        }
      >
        <MessagePrimitive.Parts />
      </UserMessageView>
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

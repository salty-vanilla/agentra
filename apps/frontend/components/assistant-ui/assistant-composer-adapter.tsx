'use client';

import { AuiIf, ComposerPrimitive } from '@assistant-ui/react';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import type { MutableRefObject } from 'react';
import type { ModelKey } from '@/components/model-selector';
import { Button } from '@/components/ui/button';
import { isMockApiMode } from '@/lib/api-config';
import { ComposerShellView } from './composer-shell-view';
import { TooltipIconButton } from './tooltip-icon-button';

interface AssistantComposerAdapterProps {
  modelValue: ModelKey;
  onModelChange: (m: ModelKey) => void;
  composerInputRef?: MutableRefObject<HTMLTextAreaElement | null>;
  slideCommandActive?: boolean;
  hasSlidePrefix?: boolean;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;
  onSlideCommandDeactivate?: () => void;
  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;
}

export function AssistantComposerAdapter({
  slideCommandActive,
  hasSlidePrefix = false,
  composerInputRef,
  ...props
}: AssistantComposerAdapterProps) {
  const showBadge = (slideCommandActive ?? false) || hasSlidePrefix;
  const placeholder = showBadge
    ? 'スライドの依頼内容を入力してください'
    : '質問や次の実装指示を入力してください（/slide でスライド作成）';

  const inputSlot = (
    <ComposerPrimitive.Input
      ref={composerInputRef}
      placeholder={placeholder}
      className="aui-composer-input max-h-32 min-h-[1.75rem] w-full resize-none bg-transparent px-1.5 py-0.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
      rows={1}
      autoFocus
      aria-label="Message input"
    />
  );

  const actionSlot = (
    <>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          render={
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-8 rounded-lg"
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
              className="aui-composer-cancel size-8 rounded-lg"
              aria-label="Stop generating"
            />
          }
        >
          <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </>
  );

  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerShellView
        {...props}
        {...(slideCommandActive !== undefined ? { slideCommandActive } : {})}
        hasSlidePrefix={hasSlidePrefix}
        showModelSelector={!isMockApiMode}
        inputSlot={inputSlot}
        actionSlot={actionSlot}
      />
    </ComposerPrimitive.Root>
  );
}

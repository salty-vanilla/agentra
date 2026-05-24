'use client';

import { AuiIf, ComposerPrimitive } from '@assistant-ui/react';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { type ModelKey, ModelSelector } from '@/components/model-selector';
import { SlideCommandBadge } from '@/components/slide-command-badge';
import { SlideCommandDialog } from '@/components/slide-command-dialog';
import { Button } from '@/components/ui/button';
import { isMockApiMode } from '@/lib/api-config';
import { TooltipIconButton } from './tooltip-icon-button';

export interface ComposerViewProps {
  modelValue: ModelKey;
  onModelChange: (model: ModelKey) => void;
  slideCommandActive?: boolean;
  /** Pre-computed from useAuiState in the container; falls back to false in Storybook */
  hasSlidePrefix?: boolean;
  onSlideCommandDeactivate?: () => void;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;
  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;
  /**
   * Override runtime-detected running state.
   * When defined, uses plain buttons instead of ComposerPrimitive.Send/Cancel.
   * Leave undefined in production (runtime detection via AuiIf).
   */
  isRunning?: boolean;
  onSend?: () => void;
  onCancel?: () => void;
}

export function ComposerView({
  modelValue,
  onModelChange,
  slideCommandActive,
  hasSlidePrefix = false,
  onSlideCommandDeactivate,
  onSlideCommandActivate,
  slideDialogOpen,
  onSlideDialogOpenChange,
  isRunning,
  onSend,
  onCancel,
}: ComposerViewProps) {
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
        <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <SlideCommandDialog
              onSubmit={(params) => onSlideCommandActivate?.(params)}
              {...(slideDialogOpen != null ? { externalOpen: slideDialogOpen } : {})}
              {...(onSlideDialogOpenChange
                ? { onOpenChange: onSlideDialogOpenChange }
                : {})}
            />
            {!isMockApiMode && (
              <ModelSelector value={modelValue} onChange={onModelChange} />
            )}
          </div>
          {isRunning !== undefined ? (
            isRunning ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-cancel size-8 rounded-full"
                aria-label="Stop generating"
                onClick={onCancel}
              >
                <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
              </Button>
            ) : (
              <TooltipIconButton
                tooltip="Send message"
                side="bottom"
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-send size-8 rounded-full"
                aria-label="Send message"
                onClick={onSend}
              >
                <ArrowUpIcon className="aui-composer-send-icon size-4" />
              </TooltipIconButton>
            )
          ) : (
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
            </>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

'use client';

import type { ReactNode } from 'react';
import type { ModelKey } from '@/components/model-selector';
import { ModelSelector } from '@/components/model-selector';
import { SlideCommandBadge } from '@/components/slide-command-badge';
import { SlideCommandDialog } from '@/components/slide-command-dialog';

export interface ComposerShellViewProps {
  modelValue: ModelKey;
  onModelChange: (model: ModelKey) => void;

  slideCommandActive?: boolean;
  hasSlidePrefix?: boolean;
  onSlideCommandDeactivate?: () => void;
  onSlideCommandActivate?: (params?: Record<string, unknown>) => void;

  slideDialogOpen?: boolean;
  onSlideDialogOpenChange?: (open: boolean) => void;

  showModelSelector?: boolean;

  inputSlot: ReactNode;
  actionSlot: ReactNode;
}

export function ComposerShellView({
  modelValue,
  onModelChange,
  slideCommandActive,
  hasSlidePrefix = false,
  onSlideCommandDeactivate,
  onSlideCommandActivate,
  slideDialogOpen,
  onSlideDialogOpenChange,
  showModelSelector = false,
  inputSlot,
  actionSlot,
}: ComposerShellViewProps) {
  const showBadge = slideCommandActive || hasSlidePrefix;

  return (
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
      {inputSlot}
      <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <SlideCommandDialog
            onSubmit={(params) => onSlideCommandActivate?.(params)}
            {...(slideDialogOpen != null ? { externalOpen: slideDialogOpen } : {})}
            {...(onSlideDialogOpenChange
              ? { onOpenChange: onSlideDialogOpenChange }
              : {})}
          />
          {showModelSelector && (
            <ModelSelector value={modelValue} onChange={onModelChange} />
          )}
        </div>
        {actionSlot}
      </div>
    </div>
  );
}

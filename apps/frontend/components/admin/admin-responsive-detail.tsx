'use client';

import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { LayoutMode } from '@/hooks/use-layout-mode';

type Props = {
  mode: LayoutMode;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Responsive container for an Admin Console detail view (Issue #366).
 *
 * The three layout modes share the same `children` so the detail content is
 * implemented once:
 * - `compact`  : full-screen modal Sheet (full width on mobile).
 * - `medium`   : modal Drawer overlay (Sheet, capped at `sm:max-w-xl`).
 * - `expanded` : non-modal inline side panel — no backdrop, scrim, or focus
 *                trap, and nothing is rendered until a row is selected so the
 *                list keeps the full width while unselected.
 */
export function AdminResponsiveDetail({ mode, open, title, onClose, children }: Props) {
  if (mode === 'expanded') {
    if (!open) return null;
    return (
      <aside
        aria-label={title}
        className="flex w-96 min-h-0 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-sm dark:border-white/15"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-4 dark:border-white/10">
          <h2 className="font-heading text-base font-medium text-foreground">{title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="詳細を閉じる"
          >
            <XIcon />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>
      </aside>
    );
  }

  // `compact` is a full-screen modal; `medium` is a right-edge Drawer capped at
  // `sm:max-w-xl`. The compact classes intentionally repeat the `data-[side=right]:`
  // variant so tailwind-merge strips SheetContent's own `data-[side=right]:w-3/4`
  // and `data-[side=right]:sm:max-w-sm` — a plain `w-full` loses to them on
  // specificity and would leave the list peeking behind the sheet.
  const contentClassName =
    mode === 'compact'
      ? 'inset-0 w-screen overflow-y-auto data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:sm:max-w-none'
      : 'w-full overflow-y-auto sm:max-w-xl';

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className={contentClassName}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

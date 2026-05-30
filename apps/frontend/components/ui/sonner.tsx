'use client';

import { Toaster } from 'sonner';

export function SonnerToaster() {
  return (
    <Toaster
      expand
      gap={10}
      offset={20}
      position="top-right"
      toastOptions={{
        duration: 6000,
        unstyled: true,
        classNames: {
          toast:
            'group flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-sm',
          content: 'flex min-w-0 flex-1 flex-col gap-1',
          title: 'font-medium text-sm leading-5',
          description: 'text-muted-foreground text-[13px] leading-5',
          icon: 'mt-0.5 shrink-0',
          actionButton:
            'inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground text-sm',
          cancelButton:
            'inline-flex h-8 shrink-0 items-center rounded-lg border border-border bg-background px-3 font-medium text-foreground text-sm',
          closeButton:
            'absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          error:
            'border-destructive/25 bg-destructive/10 text-destructive [&_[data-description]]:text-destructive/80 [&_[data-icon]]:text-destructive [&_[data-title]]:text-destructive',
        },
      }}
    />
  );
}

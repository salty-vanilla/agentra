'use client';

import { PresentationIcon } from 'lucide-react';
import type { FC } from 'react';
import { cn } from '@/lib/utils';

export const SlideCommandBadge: FC<{
  className?: string;
  onRemove?: () => void;
}> = ({ className, onRemove }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs font-medium',
        className,
      )}
    >
      <PresentationIcon className="h-3.5 w-3.5" />
      スライド作成
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm hover:bg-muted"
          aria-label="コマンドを削除"
        >
          ×
        </button>
      )}
    </span>
  );
};

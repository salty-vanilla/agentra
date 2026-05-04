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
        'inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
        className,
      )}
    >
      <PresentationIcon className="h-3.5 w-3.5" />
      スライド作成
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm hover:bg-teal-200/50 dark:hover:bg-teal-800/50"
          aria-label="コマンドを削除"
        >
          ×
        </button>
      )}
    </span>
  );
};

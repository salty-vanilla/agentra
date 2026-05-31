'use client';

import { XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SearchToolbarProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
};

export function SearchToolbar({
  value,
  onChange,
  onEnter,
  placeholder,
  className,
}: SearchToolbarProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
        placeholder={placeholder ?? '検索...'}
        className="h-8 pr-8 text-sm"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="検索条件をクリア"
          onClick={() => onChange('')}
          className="absolute right-2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

'use client';

import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ModelKey = 'opus' | 'sonnet' | 'haiku';

interface ModelOption {
  key: ModelKey;
  label: string;
  description: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  { key: 'opus', label: '松 — Opus', description: '最高精度・複雑なタスク向け' },
  { key: 'sonnet', label: '竹 — Sonnet', description: 'バランス型・推奨' },
  { key: 'haiku', label: '梅 — Haiku', description: '高速・軽量タスク向け' },
];

interface ModelSelectorProps {
  value: ModelKey;
  onChange: (model: ModelKey) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const selected = MODEL_OPTIONS.find((o) => o.key === value) ?? MODEL_OPTIONS[1];

  if (!selected) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
          aria-label="モデルを選択"
        >
          {selected.label}
          <ChevronDownIcon className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {MODEL_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onSelect={() => onChange(option.key)}
            className="flex flex-col items-start gap-0.5"
            aria-selected={option.key === value}
          >
            <span className={option.key === value ? 'font-medium' : ''}>{option.label}</span>
            <span className="text-muted-foreground text-xs">{option.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

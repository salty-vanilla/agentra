'use client';

import { PlusIcon, PresentationIcon } from 'lucide-react';
import { type FC, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type SlideCommandParams = {
  topic?: string;
  audience?: string;
  purpose?: string;
  slideCount?: number | 'auto';
  durationMinutes?: number | 'auto';
  language?: 'ja' | 'en';
  tone?: string;
};

const AUDIENCE_OPTIONS = [
  { value: 'executive', label: '経営層' },
  { value: 'manager', label: '管理者' },
  { value: 'engineer', label: '技術者' },
  { value: 'operator', label: '現場向け' },
  { value: 'customer', label: '顧客向け' },
  { value: 'general', label: '一般' },
] as const;

const PURPOSE_OPTIONS = [
  { value: 'report', label: '報告' },
  { value: 'proposal', label: '提案' },
  { value: 'decision', label: '意思決定' },
  { value: 'knowledge_share', label: '共有' },
  { value: 'training', label: '教育' },
] as const;

const SLIDE_COUNT_OPTIONS = [
  { value: 'auto', label: '自動' },
  { value: '5', label: '5' },
  { value: '7', label: '7' },
  { value: '10', label: '10' },
  { value: '15', label: '15' },
] as const;

const DURATION_OPTIONS = [
  { value: 'auto', label: '自動' },
  { value: '3', label: '3分' },
  { value: '5', label: '5分' },
  { value: '10', label: '10分' },
  { value: '15', label: '15分' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
] as const;

const TONE_OPTIONS = [
  { value: 'executive', label: 'Executive' },
  { value: 'technical', label: 'Technical' },
  { value: 'sales', label: 'Sales' },
  { value: 'simple', label: 'Simple' },
] as const;

function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  id: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export const SlideCommandDialog: FC<{
  onSubmit: (params: SlideCommandParams) => void;
  externalOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}> = ({ onSubmit, externalOpen, onOpenChange }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [audience, setAudience] = useState('executive');
  const [purpose, setPurpose] = useState('report');
  const [slideCount, setSlideCount] = useState('auto');
  const [duration, setDuration] = useState('auto');
  const [language, setLanguage] = useState('ja');
  const [tone, setTone] = useState('executive');

  function handleSubmit() {
    onSubmit({
      audience,
      purpose,
      slideCount: slideCount === 'auto' ? 'auto' : Number.parseInt(slideCount, 10),
      durationMinutes: duration === 'auto' ? 'auto' : Number.parseInt(duration, 10),
      language: language as 'ja' | 'en',
      tone,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            aria-label="コマンド追加"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DialogTrigger asChild>
            <DropdownMenuItem>
              <PresentationIcon className="mr-2 h-4 w-4" />
              スライド作成
            </DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PresentationIcon className="h-5 w-5" />
            スライド作成
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            依頼内容はチャット欄に入力してください。ここではオプションを設定できます。
          </p>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              id="slide-audience"
              label="対象読者"
              value={audience}
              onChange={setAudience}
              options={AUDIENCE_OPTIONS}
            />
            <SelectField
              id="slide-purpose"
              label="目的"
              value={purpose}
              onChange={setPurpose}
              options={PURPOSE_OPTIONS}
            />
            <SelectField
              id="slide-count"
              label="スライド枚数"
              value={slideCount}
              onChange={setSlideCount}
              options={SLIDE_COUNT_OPTIONS}
            />
            <SelectField
              id="slide-duration"
              label="発表時間"
              value={duration}
              onChange={setDuration}
              options={DURATION_OPTIONS}
            />
            <SelectField
              id="slide-language"
              label="言語"
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
            />
            <SelectField
              id="slide-tone"
              label="トーン"
              value={tone}
              onChange={setTone}
              options={TONE_OPTIONS}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full">
            <PresentationIcon className="mr-2 h-4 w-4" />
            スライド作成を開始
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

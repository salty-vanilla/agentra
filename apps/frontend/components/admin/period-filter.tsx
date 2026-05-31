'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type Period = 'today' | '7d' | 'custom';

type Props = {
  period: Period;
  from: string;
  to: string;
  onChange: (period: Period, from: string, to: string) => void;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export function PeriodFilter({ period, from, to, onChange }: Props) {
  const today = todayStr();

  function handlePeriodClick(p: Period) {
    if (p === 'today') {
      onChange('today', today, today);
    } else if (p === '7d') {
      onChange('7d', sevenDaysAgoStr(), today);
    } else {
      onChange('custom', from, to);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(['today', '7d', 'custom'] as Period[]).map((p) => (
        <Button
          key={p}
          variant={period === p ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePeriodClick(p)}
        >
          {p === 'today' ? '今日' : p === '7d' ? '過去7日' : 'カスタム'}
        </Button>
      ))}
      {period === 'custom' && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            max={to}
            className="h-8 w-36 text-sm"
            onChange={(e) => onChange('custom', e.target.value, to)}
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={to}
            min={from}
            max={today}
            className="h-8 w-36 text-sm"
            onChange={(e) => onChange('custom', from, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

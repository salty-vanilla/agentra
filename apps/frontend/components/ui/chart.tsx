'use client';

import * as React from 'react';
import { Legend, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// ── Chart config ──────────────────────────────────────────────────────────────

export type ChartConfig = Record<string, { label: string; color: string }>;

// ── Context ───────────────────────────────────────────────────────────────────

type ChartContextValue = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextValue | null>(null);

export function useChart(): ChartContextValue {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error('useChart must be used inside ChartContainer');
  return ctx;
}

// ── ChartContainer ────────────────────────────────────────────────────────────

type ChartContainerProps = {
  config: ChartConfig;
  children: React.ReactNode;
  className?: string;
};

export function ChartContainer({ config, children, className }: ChartContainerProps) {
  const cssVars = Object.fromEntries(
    Object.entries(config).map(([key, { color }]) => [`--color-${key}`, color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn('w-full', className)} style={cssVars}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────

export { Tooltip as ChartTooltip };

type TooltipContentProps = {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string }>;
  label?: string;
  labelFormatter?: (label: string) => string;
  formatter?: (value: number | string, name: string) => string;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
}: TooltipContentProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = labelFormatter ? labelFormatter(label ?? '') : label;

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-sm text-sm">
      {displayLabel && <p className="mb-1 font-medium text-foreground">{displayLabel}</p>}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : String(entry.value);
          return (
            <div key={entry.name} className="flex items-center gap-2">
              {entry.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
              )}
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ChartLegend ───────────────────────────────────────────────────────────────

export { Legend as ChartLegend };

type LegendContentProps = {
  payload?: Array<{ value: string; color?: string }>;
};

export function ChartLegendContent({ payload }: LegendContentProps) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          {entry.color && (
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
          )}
          {entry.value}
        </div>
      ))}
    </div>
  );
}

// ── ChartEmptyState ───────────────────────────────────────────────────────────

export function ChartEmptyState({
  message = 'この期間のデータはありません。',
}: {
  message?: string;
}) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

'use client';

import { CheckIcon, Loader2Icon, PresentationIcon, XCircleIcon } from 'lucide-react';
import type { FC } from 'react';
import type { ProgressSummaryEvent } from '@/lib/generated/model';

export const ProgressSummaryCard: FC<{
  events: ProgressSummaryEvent[];
  activePhase?: string;
}> = ({ events, activePhase }) => {
  if (events.length === 0) return null;

  const hasError = events.some((e) => e.phase === 'error');

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PresentationIcon className="h-4 w-4" />
        <span>{hasError ? 'スライド作成に失敗しました' : 'スライド作成中'}</span>
      </div>

      <div className="mt-3 space-y-3">
        {events.map((event) => (
          <div key={`${event.phase}-${event.timestamp}`} className="flex gap-2">
            <div className="mt-0.5">
              {event.phase === 'error' ? (
                <XCircleIcon className="h-4 w-4 text-destructive" />
              ) : event.phase === activePhase ? (
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <CheckIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                {event.title}
              </div>
              <div className="text-sm text-muted-foreground/80">{event.summary}</div>
              {event.details?.length ? (
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground/70">
                  {event.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

'use client';

import { Loader2Icon, PresentationIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DeckSlideFrame, useDeckDefs } from '@/components/deck-preview';
import type {
  DeckGenPhase,
  StreamingDeckPhase,
  StreamingDeckState,
} from '@/lib/deck-stream';
import type { DeckSlidePreview } from '@/lib/generated/model';
import { cn } from '@/lib/utils';

/**
 * Streaming Deck Preview shell (Epic #403, Issues #409/#410).
 *
 * Renders a deck *while it is being built*: a planning placeholder, then slides
 * appearing one-by-one as `deck_slide_compose_ready` events arrive, then a
 * completed/failed terminal state. Slide rendering reuses the exact static
 * {@link DeckSlideFrame} + {@link useDeckDefs} so a mid-stream slide looks
 * identical to the final static DeckPreview. Tolerant of missing/late events.
 */

const PHASE_LABEL: Record<StreamingDeckPhase, string> = {
  idle: '',
  planning: 'アウトラインを作成中…',
  generating: 'スライドを作成中…',
  completed: '完成しました',
  failed: '一部のプレビュー生成に失敗しました',
};

/** Coarse generation phase labels (Epic #425) shown during the authoring wait. */
const GEN_PHASE_LABEL: Record<DeckGenPhase, string> = {
  planning: '構成を計画中…',
  authoring: 'スライドを作成中…',
  rendering: 'レンダリング中…',
  reviewing: '校正中…',
  composing: 'プレビューを生成中…',
};

function StatusBadge({
  phase,
  genPhase,
}: {
  phase: StreamingDeckPhase;
  genPhase: DeckGenPhase | null;
}) {
  if (phase === 'failed') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-amber-600 text-xs dark:text-amber-500">
        <TriangleAlertIcon className="size-3.5" aria-hidden />
        {PHASE_LABEL.failed}
      </span>
    );
  }
  if (phase === 'completed') {
    return (
      <span className="shrink-0 text-muted-foreground text-xs">
        {PHASE_LABEL.completed}
      </span>
    );
  }
  // Prefer the granular generation phase (Epic #425) while in progress.
  const label = genPhase
    ? GEN_PHASE_LABEL[genPhase]
    : PHASE_LABEL[phase] || PHASE_LABEL.generating;
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
      <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/** A pending slide tile shown before its compose payload has arrived. */
function PlaceholderFrame({ label }: { label: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground text-xs">
      {label}
    </div>
  );
}

export interface StreamingDeckPreviewProps {
  state: StreamingDeckState;
  className?: string;
}

export function StreamingDeckPreview({ state, className }: StreamingDeckPreviewProps) {
  const { defs, defsErrored } = useDeckDefs(state.defsUrl);
  const { slides, totalSlides, phase } = state;

  // Track the newest ready slide so freshly-arrived slides surface automatically,
  // while still letting the user scroll back through earlier ones.
  const [active, setActive] = useState(0);
  const readyCount = slides.length;
  const prevReadyRef = useRef(0);
  useEffect(() => {
    if (readyCount > prevReadyRef.current) {
      setActive(readyCount - 1);
    }
    prevReadyRef.current = readyCount;
  }, [readyCount]);

  if (phase === 'idle') return null;

  const total = totalSlides ?? readyCount;
  const activeSlide = slides[Math.min(active, Math.max(0, readyCount - 1))];

  return (
    <div
      data-testid="streaming-deck-preview"
      data-phase={phase}
      className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PresentationIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-sm">
            {state.name || 'プレゼンテーション'}
          </span>
        </div>
        <StatusBadge phase={phase} genPhase={state.genPhase} />
      </div>

      {/* Main frame: newest ready slide, or a planning placeholder. */}
      {activeSlide ? (
        <DeckSlideFrame
          key={activeSlide.slug}
          defs={defs}
          defsErrored={defsErrored}
          slide={activeSlide satisfies DeckSlidePreview}
        />
      ) : (
        <PlaceholderFrame
          label={
            phase === 'failed' ? 'プレビューを生成できませんでした' : PHASE_LABEL[phase]
          }
        />
      )}

      {/* Progress row: ready / total + per-slide dots (ready filled, pending hollow). */}
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {readyCount} / {total || '…'}
        </span>
        {total > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
            {Array.from({ length: total }).map((_, i) => {
              // Map dot position → the slide whose 1-based index matches, so a
              // dot always points at its own slide even on out-of-order arrival.
              const position = i + 1;
              const slideIndex = slides.findIndex((s) => s.index === position);
              const dotSlide = slideIndex >= 0 ? slides[slideIndex] : undefined;
              const ready = dotSlide !== undefined;
              const dotKey = dotSlide ? dotSlide.slug : `pending-${position}`;
              return (
                <button
                  type="button"
                  key={dotKey}
                  aria-label={`スライド ${position}`}
                  aria-current={ready && slideIndex === active ? true : undefined}
                  disabled={!ready}
                  onClick={() => setActive(slideIndex)}
                  className={cn(
                    'h-1.5 w-4 shrink-0 rounded-full transition-colors',
                    ready
                      ? slideIndex === active
                        ? 'bg-primary'
                        : 'bg-primary/40'
                      : 'border border-muted-foreground/30 bg-transparent',
                  )}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {phase === 'failed' && state.failedReason ? (
        <p className="text-amber-600 text-xs dark:text-amber-500">
          生成済みのスライドとPPTXは引き続きご利用いただけます。
        </p>
      ) : null}
    </div>
  );
}

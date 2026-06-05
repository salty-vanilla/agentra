'use client';

import DOMPurify from 'dompurify';
import { ChevronLeftIcon, ChevronRightIcon, PresentationIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedSlideOverlay } from '@/components/animated-slide-overlay';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { type AnimBox, animTotalMs, changedAnimBoxes } from '@/lib/deck-anim';
import {
  buildSlideInnerSvg,
  COMPOSE_VERSION,
  type ComposeData,
  type DefsData,
  isComposeData,
  isDefsData,
} from '@/lib/deck-preview';
import type { DeckResult, DeckSlidePreview } from '@/lib/generated/model';
import { cn } from '@/lib/utils';

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch the deck-wide shared defs once. With no URL we resolve to empty defs
 * (slides still draw; shared gradients/fonts are simply unavailable). Shared by
 * the static {@link DeckPreview} and the streaming shell so both render slides
 * identically.
 */
export function useDeckDefs(defsUrl: string | null | undefined): {
  defs: DefsData | null;
  defsErrored: boolean;
} {
  const [defs, setDefs] = useState<DefsData | null>(null);
  const [defsErrored, setDefsErrored] = useState(false);

  useEffect(() => {
    if (!defsUrl) {
      setDefs({ version: COMPOSE_VERSION, defs: '' });
      setDefsErrored(false);
      return;
    }
    const ctrl = new AbortController();
    setDefs(null);
    setDefsErrored(false);
    fetchJson(defsUrl, ctrl.signal)
      .then((data) => {
        if (isDefsData(data) && data.version === COMPOSE_VERSION) setDefs(data);
        else setDefsErrored(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setDefsErrored(true);
      });
    return () => ctrl.abort();
  }, [defsUrl]);

  return { defs, defsErrored };
}

/** Renders one slide by building a sanitized static SVG from compose + defs. */
export function DeckSlideFrame({
  defs,
  defsErrored,
  slide,
}: {
  defs: DefsData | null;
  defsErrored: boolean;
  slide: DeckSlidePreview;
}) {
  const [compose, setCompose] = useState<ComposeData | null>(null);
  const [errored, setErrored] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // AnimatedSlidePreview (Epic #424): animate changed components over the static
  // SVG. First appearance animates every component; a composeUrl update animates
  // only the backend-marked `changed` ones. Skipped under prefers-reduced-motion.
  const reducedMotion = useReducedMotion();
  const [animBoxes, setAnimBoxes] = useState<AnimBox[]>([]);
  const seenComposeRef = useRef(false);

  // Fetch this slide's compose payload.
  useEffect(() => {
    if (!slide.composeUrl) return;
    const ctrl = new AbortController();
    setCompose(null);
    setErrored(false);
    fetchJson(slide.composeUrl, ctrl.signal)
      .then((data) => {
        if (isComposeData(data) && data.version === COMPOSE_VERSION) setCompose(data);
        else setErrored(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setErrored(true);
      });
    return () => ctrl.abort();
  }, [slide.composeUrl]);

  // Build the static SVG once both defs and compose are available.
  useEffect(() => {
    const container = ref.current;
    if (!container || !defs || !compose) return;
    const inner = buildSlideInnerSvg(defs.defs, compose);
    const raw = `<svg viewBox="${compose.viewBox}" preserveAspectRatio="xMidYMid" style="width:100%;height:100%;display:block">${inner}</svg>`;
    // Defense in depth: even though the markup comes from our own pipeline, this
    // is an innerHTML sink — sanitize against any injected script/handlers.
    container.innerHTML = DOMPurify.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    return () => {
      container.innerHTML = '';
    };
  }, [defs, compose]);

  // Drive the animation overlay when a *new* compose payload renders. Gated on a
  // genuine compose change (not a reducedMotion toggle) so flipping motion off
  // doesn't replay an already-shown slide.
  const prevComposeRef = useRef<ComposeData | null>(null);
  useEffect(() => {
    if (!compose) return;
    const composeChanged = prevComposeRef.current !== compose;
    prevComposeRef.current = compose;
    if (reducedMotion) {
      setAnimBoxes([]);
      return;
    }
    if (!composeChanged) return;
    const isFirst = !seenComposeRef.current;
    seenComposeRef.current = true;
    const boxes = changedAnimBoxes(compose, isFirst);
    setAnimBoxes(boxes);
    if (boxes.length === 0) return;
    const timer = setTimeout(() => setAnimBoxes([]), animTotalMs(boxes.length) + 100);
    return () => clearTimeout(timer);
  }, [compose, reducedMotion]);

  const canRenderSvg = Boolean(defs && compose);
  const showError = errored || defsErrored;

  // MVP renders from compose+defs only. A WebP poster (slide.previewUrl) is a
  // future enhancement; the field is intentionally not consumed yet.
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
      {/* Compose+defs SVG, built imperatively from trusted pipeline output. */}
      <div
        ref={ref}
        data-testid="deck-slide-svg"
        className={cn('absolute inset-0', canRenderSvg ? 'opacity-100' : 'opacity-0')}
      />
      {canRenderSvg && animBoxes.length > 0 ? (
        <AnimatedSlideOverlay boxes={animBoxes} />
      ) : null}
      {!canRenderSvg ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          {showError ? 'プレビューを読み込めませんでした' : 'プレビューを生成中…'}
        </div>
      ) : null}
    </div>
  );
}

export interface DeckPreviewProps {
  deck: DeckResult;
  className?: string;
}

export function DeckPreview({ deck, className }: DeckPreviewProps) {
  const { defs, defsErrored } = useDeckDefs(deck.defsUrl);
  const [active, setActive] = useState(0);

  const slides = deck.slides;
  if (slides.length === 0) return null;

  const current = slides[Math.min(active, slides.length - 1)];
  if (!current) return null;

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PresentationIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-sm">{deck.name}</span>
        </div>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {active + 1} / {slides.length}
        </span>
      </div>

      {/* key per slug: remount on slide change so first-appearance animation resets. */}
      <DeckSlideFrame
        key={current.slug}
        defs={defs}
        defsErrored={defsErrored}
        slide={current}
      />

      {slides.length > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="前のスライド"
            disabled={active === 0}
            onClick={() => setActive((i) => Math.max(0, i - 1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 justify-center gap-1 overflow-x-auto">
            {slides.map((slide, i) => (
              <button
                type="button"
                key={slide.slug}
                aria-label={`スライド ${i + 1}`}
                aria-current={i === active ? true : undefined}
                onClick={() => setActive(i)}
                className={cn(
                  'h-1.5 w-4 shrink-0 rounded-full transition-colors',
                  i === active ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="次のスライド"
            disabled={active === slides.length - 1}
            onClick={() => setActive((i) => Math.min(slides.length - 1, i + 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

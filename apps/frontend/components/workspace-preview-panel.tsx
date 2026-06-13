'use client';

import {
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  PresentationIcon,
} from 'lucide-react';
import { DeckSlideFrame, useDeckDefs } from '@/components/deck-preview';
import {
  type WorkspaceSlideView,
  workspaceProgress,
  workspaceSlideViews,
  workspaceSpecs,
} from '@/lib/deck-workspace-view';
import type { DeckSnapshotResponse } from '@/lib/generated/model';
import { cn } from '@/lib/utils';

/**
 * SDPM Workspace Preview (Epic #442 / #447).
 *
 * Shows a deck *as it is authored*, before/while compose previews arrive: a
 * specs strip (brief / outline / art direction) and slide skeleton cards (slug,
 * 1-slide-1-message, layout intent, status). A card with a ready compose payload
 * renders the real {@link DeckSlideFrame}, identical to the static DeckPreview;
 * the rest stay as skeletons. Tolerant of partial/missing workspace data.
 */

const SPEC_LINKS: {
  key: 'briefUrl' | 'outlineUrl' | 'artDirectionUrl';
  label: string;
}[] = [
  { key: 'briefUrl', label: 'ブリーフ' },
  { key: 'outlineUrl', label: 'アウトライン' },
  { key: 'artDirectionUrl', label: 'アートディレクション' },
];

function SpecsStrip({ snapshot }: { snapshot: DeckSnapshotResponse }) {
  const specs = workspaceSpecs(snapshot);
  if (!specs) return null;
  const available = SPEC_LINKS.filter(({ key }) => specs[key]);
  if (available.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {available.map(({ key, label }) => (
        <a
          key={key}
          href={specs[key] as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-muted-foreground text-xs hover:bg-muted"
        >
          <FileTextIcon className="size-3.5" aria-hidden />
          {label}
        </a>
      ))}
    </div>
  );
}

function SkeletonCard({ view }: { view: WorkspaceSlideView }) {
  return (
    <div
      data-testid="workspace-skeleton-card"
      data-status="skeleton"
      className="flex aspect-video w-full flex-col justify-between rounded-md border border-dashed bg-muted/30 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-muted-foreground text-xs">#{view.index}</span>
        <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
          <Loader2Icon className="size-3 animate-spin" aria-hidden />
          作成中
        </span>
      </div>
      <div className="min-w-0">
        {view.title ? (
          <p className="truncate font-medium text-foreground text-sm">{view.title}</p>
        ) : null}
        {view.message ? (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
            {view.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {view.layoutIntent ? (
          <span className="truncate rounded bg-muted px-1.5 py-0.5">
            {view.layoutIntent}
          </span>
        ) : null}
        <span className="truncate">{view.slug}</span>
      </div>
    </div>
  );
}

function SlideCell({
  view,
  defs,
  defsErrored,
}: {
  view: WorkspaceSlideView;
  defs: ReturnType<typeof useDeckDefs>['defs'];
  defsErrored: boolean;
}) {
  if (view.status === 'ready' && view.composeUrl) {
    return (
      <div data-testid="workspace-ready-card" data-status="ready" className="w-full">
        <DeckSlideFrame
          defs={defs}
          defsErrored={defsErrored}
          slide={{
            slug: view.slug,
            composeUrl: view.composeUrl,
            previewUrl: view.previewUrl,
          }}
        />
        {view.title ? (
          <p className="mt-1 truncate text-muted-foreground text-xs">
            #{view.index} {view.title}
          </p>
        ) : null}
      </div>
    );
  }
  return <SkeletonCard view={view} />;
}

export interface WorkspacePreviewPanelProps {
  snapshot: DeckSnapshotResponse | null | undefined;
  className?: string;
}

export function WorkspacePreviewPanel({
  snapshot,
  className,
}: WorkspacePreviewPanelProps) {
  const { defs, defsErrored } = useDeckDefs(snapshot?.defsUrl);
  // No workspace projection → render nothing (agentra-pptxgenjs decks are shown
  // by the existing DeckPreview / StreamingDeckPreview instead).
  if (!snapshot?.workspace) return null;

  const views = workspaceSlideViews(snapshot);
  const { ready, total } = workspaceProgress(views);
  const allReady = total > 0 && ready === total;

  return (
    <div
      data-testid="workspace-preview-panel"
      className={cn('flex flex-col gap-3 rounded-lg border bg-card p-3', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PresentationIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-sm">
            {snapshot.name || 'プレゼンテーション'}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
          {allReady ? (
            <CheckCircle2Icon
              className="size-3.5 text-emerald-600 dark:text-emerald-500"
              aria-hidden
            />
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          )}
          {total > 0 ? `${ready}/${total} スライド` : 'スライドを準備中…'}
        </span>
      </div>

      <SpecsStrip snapshot={snapshot} />

      {views.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {views.map((view) => (
            <SlideCell
              key={view.slug}
              view={view}
              defs={defs}
              defsErrored={defsErrored}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">アウトラインを作成中…</p>
      )}
    </div>
  );
}

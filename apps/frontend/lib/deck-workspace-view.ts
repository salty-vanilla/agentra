import type {
  DeckSnapshotResponse,
  DeckWorkspaceSlideSkeleton,
  DeckWorkspaceSpecs,
} from '@/lib/generated/model';

/**
 * SDPM Workspace Preview view-model (Epic #442 / #447).
 *
 * Merges the snapshot's `workspace.slides` (semantic skeletons authored before
 * compose) with `slides` (compose-derived previews, keyed positionally) into a
 * single ordered list the UI renders. The two sides join on **index** — compose
 * slugs are LibreOffice-positional (`slide-N`) while workspace slugs are semantic
 * (`intro`), so index is the stable bridge (see #448).
 */

export type WorkspaceSlideStatus = 'skeleton' | 'ready';

export interface WorkspaceSlideView {
  /** Semantic slug from the SDPM workspace. */
  slug: string;
  index: number;
  title: string | null;
  message: string | null;
  layoutIntent: string | null;
  /** `ready` once a compose preview exists for this index, else `skeleton`. */
  status: WorkspaceSlideStatus;
  /** Compose payload URL for the matching positional slide (null until ready). */
  composeUrl: string | null;
  previewUrl: string | null;
}

/** Whether the snapshot carries an SDPM workspace projection to display. */
export function hasWorkspace(
  snapshot: DeckSnapshotResponse | null | undefined,
): snapshot is DeckSnapshotResponse & {
  workspace: NonNullable<DeckSnapshotResponse['workspace']>;
} {
  return Boolean(snapshot?.workspace);
}

export function workspaceSpecs(
  snapshot: DeckSnapshotResponse | null | undefined,
): DeckWorkspaceSpecs | null {
  return snapshot?.workspace?.specs ?? null;
}

function skeletonToView(
  s: DeckWorkspaceSlideSkeleton,
  compose: { composeUrl: string | null; previewUrl: string | null } | undefined,
): WorkspaceSlideView {
  const composeUrl = compose?.composeUrl ?? null;
  return {
    slug: s.slug,
    index: s.index,
    title: s.title ?? null,
    message: s.message ?? null,
    layoutIntent: s.layoutIntent ?? null,
    // A compose URL means the slide is renderable now, regardless of the
    // skeleton's last-known status (the snapshot is the source of truth).
    status: composeUrl ? 'ready' : (s.status as WorkspaceSlideStatus),
    composeUrl,
    previewUrl: compose?.previewUrl ?? null,
  };
}

/**
 * Build the ordered slide view list, joining workspace skeletons to compose
 * previews by index. Pure. Returns `[]` when there is no workspace.
 */
export function workspaceSlideViews(
  snapshot: DeckSnapshotResponse | null | undefined,
): WorkspaceSlideView[] {
  if (!snapshot?.workspace) return [];
  const composeByIndex = new Map(
    snapshot.slides.map((s) => [
      s.index,
      { composeUrl: s.composeUrl, previewUrl: s.previewUrl },
    ]),
  );
  return [...snapshot.workspace.slides]
    .sort((a, b) => a.index - b.index)
    .map((s) => skeletonToView(s, composeByIndex.get(s.index)));
}

/** Count of ready vs total slides for a compact progress label. */
export function workspaceProgress(views: WorkspaceSlideView[]): {
  ready: number;
  total: number;
} {
  return {
    ready: views.filter((v) => v.status === 'ready').length,
    total: views.length,
  };
}

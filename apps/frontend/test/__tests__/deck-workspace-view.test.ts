import { describe, expect, it } from 'vitest';
import {
  hasWorkspace,
  workspaceProgress,
  workspaceSlideViews,
  workspaceSpecs,
} from '@/lib/deck-workspace-view';
import type { DeckSnapshotResponse } from '@/lib/generated/model';

function snap(overrides: Partial<DeckSnapshotResponse> = {}): DeckSnapshotResponse {
  return {
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja',
    slideOrder: [],
    defsUrl: null,
    defsEpoch: 0,
    slides: [],
    epoch: 0,
    ...overrides,
  };
}

describe('hasWorkspace / workspaceSpecs', () => {
  it('is false and null when there is no workspace', () => {
    expect(hasWorkspace(snap())).toBe(false);
    expect(hasWorkspace(null)).toBe(false);
    expect(workspaceSpecs(snap())).toBeNull();
  });

  it('returns specs when present', () => {
    const s = snap({
      workspace: {
        specs: { briefUrl: 'b', outlineUrl: 'o', artDirectionUrl: null },
        slides: [],
      },
    });
    expect(hasWorkspace(s)).toBe(true);
    expect(workspaceSpecs(s)?.briefUrl).toBe('b');
  });
});

describe('workspaceSlideViews', () => {
  it('returns [] without a workspace', () => {
    expect(workspaceSlideViews(snap())).toEqual([]);
  });

  it('orders skeletons by index and marks them skeleton when no compose', () => {
    const s = snap({
      workspace: {
        specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
        slides: [
          {
            slug: 'summary',
            index: 2,
            title: 'まとめ',
            message: '行動',
            layoutIntent: 'Blank',
            status: 'skeleton',
          },
          {
            slug: 'intro',
            index: 1,
            title: 'はじめに',
            message: '目的',
            layoutIntent: 'Title',
            status: 'skeleton',
          },
        ],
      },
    });
    const views = workspaceSlideViews(s);
    expect(views.map((v) => v.slug)).toEqual(['intro', 'summary']);
    expect(views.every((v) => v.status === 'skeleton')).toBe(true);
    expect(views[0]?.composeUrl).toBeNull();
  });

  it('joins compose previews to skeletons by index and marks them ready', () => {
    const s = snap({
      slides: [
        {
          slug: 'slide-1',
          index: 1,
          epoch: 1,
          composeUrl: 'https://c/1?sig',
          previewUrl: 'https://p/1',
        },
      ],
      workspace: {
        specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
        slides: [
          {
            slug: 'intro',
            index: 1,
            title: 'はじめに',
            message: '目的',
            layoutIntent: 'Title',
            status: 'skeleton',
          },
          {
            slug: 'summary',
            index: 2,
            title: null,
            message: null,
            layoutIntent: null,
            status: 'skeleton',
          },
        ],
      },
    });
    const views = workspaceSlideViews(s);
    expect(views[0]).toMatchObject({
      slug: 'intro',
      status: 'ready',
      composeUrl: 'https://c/1?sig',
    });
    expect(views[1]).toMatchObject({
      slug: 'summary',
      status: 'skeleton',
      composeUrl: null,
    });
    expect(workspaceProgress(views)).toEqual({ ready: 1, total: 2 });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  markComposeChanged,
  type ReviseSlideDeps,
  reviseSlide,
} from '../revise-slide.js';

const composeJson = {
  version: 1,
  viewBox: '0 0 1280 720',
  bgFill: '#000',
  bgSvg: null,
  components: [
    { class: 'title', bbox: null, text: 'A', svg: '<text/>', changed: false },
    { class: 'body', bbox: null, text: 'B', svg: '<text/>', changed: false },
  ],
};

describe('markComposeChanged', () => {
  it('sets changed=true on every component (immutably)', () => {
    const out = markComposeChanged(composeJson);
    expect(out.components.every((c) => c.changed)).toBe(true);
    // original untouched
    expect(composeJson.components.every((c) => c.changed === false)).toBe(true);
    expect(out).not.toBe(composeJson);
  });

  it('returns a fresh object even without a components array', () => {
    const odd = { version: 1 } as unknown as typeof composeJson;
    const out = markComposeChanged(odd);
    expect(out).toEqual(odd);
    expect(out).not.toBe(odd); // distinct reference, safe to mutate
  });
});

function deps(over: Partial<ReviseSlideDeps> = {}): ReviseSlideDeps {
  return {
    readCompose: vi.fn(async () => structuredClone(composeJson)),
    persistRevised: vi.fn(async (input) => ({
      slug: input.slug,
      index: input.index,
      composeUrl: `https://cdn/${input.slug}.${input.epoch}.json?sig`,
      previewUrl: null,
      defsUrl: null,
    })),
    ...over,
  };
}

describe('reviseSlide', () => {
  it('persists the revised slide as changed with a fresh epoch and emits it', async () => {
    const onSlideReady = vi.fn();
    const d = deps({ onSlideReady });
    const result = await reviseSlide(
      { deckId: 'deck-1', slug: 'slide-2', index: 2, composePath: '/w/slide-2.json' },
      d,
    );

    expect(result?.slug).toBe('slide-2');
    expect(onSlideReady).toHaveBeenCalledWith(result);
    // persistRevised was called with a changed compose + a positive epoch.
    const call = (d.persistRevised as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.slug).toBe('slide-2');
    expect(call.epoch).toBeGreaterThan(0);
    expect(call.compose.components.every((c: { changed: boolean }) => c.changed)).toBe(
      true,
    );
  });

  it('only touches the target slug (other slides are never persisted)', async () => {
    const d = deps();
    await reviseSlide(
      { deckId: 'deck-1', slug: 'slide-3', index: 3, composePath: '/w/slide-3.json' },
      d,
    );
    expect(d.persistRevised).toHaveBeenCalledTimes(1);
    const call = (d.persistRevised as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.slug).toBe('slide-3');
  });

  it('degrades to null (no throw) when the compose cannot be read', async () => {
    const d = deps({
      readCompose: vi.fn(async () => {
        throw new Error('missing');
      }),
    });
    const result = await reviseSlide(
      { deckId: 'deck-1', slug: 'slide-1', index: 1, composePath: '/w/x.json' },
      d,
    );
    expect(result).toBeNull();
    expect(d.persistRevised).not.toHaveBeenCalled();
  });

  it('returns null when persist produces no result', async () => {
    const d = deps({ persistRevised: vi.fn(async () => null) });
    const result = await reviseSlide(
      { deckId: 'deck-1', slug: 'slide-1', index: 1, composePath: '/w/x.json' },
      d,
    );
    expect(result).toBeNull();
  });

  it('degrades to null (no throw) when persist throws', async () => {
    const d = deps({
      persistRevised: vi.fn(async () => {
        throw new Error('s3 down');
      }),
    });
    await expect(
      reviseSlide(
        { deckId: 'deck-1', slug: 'slide-1', index: 1, composePath: '/w/x.json' },
        d,
      ),
    ).resolves.toBeNull();
  });
});

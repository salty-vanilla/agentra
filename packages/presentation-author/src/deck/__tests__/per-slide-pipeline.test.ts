import { describe, expect, it, vi } from 'vitest';
import type { ComposeSvgResult } from '../compose.js';
import type { ExportSvgResult } from '../export-svg.js';
import { generatePerSlideDeck, type PerSlideDeckDeps } from '../per-slide-pipeline.js';
import type { SplitPptxResult } from '../split-pptx.js';

function okExport(svgPath: string): ExportSvgResult {
  return { success: true, svgPath, stdout: '', stderr: '', durationMs: 1, warnings: [] };
}

function okCompose(slug: string, composePath: string): ComposeSvgResult {
  return {
    success: true,
    defsPath: '/work/defs.json',
    slides: [{ slug, index: 1, composePath }],
    stdout: '',
    stderr: '',
    durationMs: 1,
    warnings: [],
  };
}

function splitOk(n: number): SplitPptxResult {
  return {
    success: true,
    slides: Array.from({ length: n }, (_, i) => ({
      index: i + 1,
      pptxPath: `/work/slide-${i + 1}.pptx`,
    })),
    stdout: '',
    stderr: '',
    durationMs: 1,
    warnings: [],
  };
}

function baseInput() {
  return {
    pptxPath: '/work/deck.pptx',
    outputDir: '/work/deck',
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja' as const,
  };
}

function deps(over: Partial<PerSlideDeckDeps> = {}): PerSlideDeckDeps {
  return {
    splitPptx: vi.fn(async () => splitOk(3)),
    exportSvg: vi.fn(async (i) => okExport(`${i.outputDir}/slide.svg`)),
    composeSvg: vi.fn(async (i) =>
      okCompose('slide-x', `${i.outputDir}/slide-x.compose.json`),
    ),
    persistSlide: vi.fn(async (s) => ({
      slug: s.slug,
      index: s.index,
      composeUrl: `https://cdn/${s.slug}.json?sig`,
      previewUrl: null,
      defsUrl: s.isFirst ? 'https://cdn/defs.json?sig' : null,
    })),
    ...over,
  };
}

describe('generatePerSlideDeck', () => {
  it('persists and emits one slide at a time in source order', async () => {
    const emitted: number[] = [];
    const d = deps({ onSlideReady: (s) => emitted.push(s.index) });

    const result = await generatePerSlideDeck(baseInput(), d);

    expect(result.ok).toBe(true);
    expect(result.slides.map((s) => s.index)).toEqual([1, 2, 3]);
    // Each slide was emitted as it became ready, in order.
    expect(emitted).toEqual([1, 2, 3]);
    expect(d.persistSlide).toHaveBeenCalledTimes(3);
  });

  it('uploads slide 1 before slide 3 is exported (incremental, not batched)', async () => {
    const calls: string[] = [];
    const d = deps({
      exportSvg: vi.fn(async (i) => {
        calls.push(`export:${i.pptxPath}`);
        return okExport(`${i.outputDir}/slide.svg`);
      }),
      persistSlide: vi.fn(async (s) => {
        calls.push(`persist:${s.index}`);
        return {
          slug: s.slug,
          index: s.index,
          composeUrl: 'u',
          previewUrl: null,
          defsUrl: null,
        };
      }),
    });

    await generatePerSlideDeck(baseInput(), d);

    // slide 1 is persisted before slide 3 is even exported.
    expect(calls.indexOf('persist:1')).toBeLessThan(
      calls.indexOf('export:/work/slide-3.pptx'),
    );
  });

  it('marks defs on the first slide only', async () => {
    const d = deps();
    const result = await generatePerSlideDeck(baseInput(), d);
    expect(result.slides[0]?.defsUrl).not.toBeNull();
    expect(result.slides[1]?.defsUrl).toBeNull();
  });

  it('reports the slide count via onStart after a successful split', async () => {
    const onStart = vi.fn();
    await generatePerSlideDeck(baseInput(), deps({ onStart }));
    expect(onStart).toHaveBeenCalledWith(3);
  });

  it('does not call onStart when the split fails', async () => {
    const onStart = vi.fn();
    await generatePerSlideDeck(
      baseInput(),
      deps({
        onStart,
        splitPptx: vi.fn(async () => ({
          success: false,
          slides: [],
          stdout: '',
          stderr: '',
          durationMs: 1,
          warnings: [],
        })),
      }),
    );
    expect(onStart).not.toHaveBeenCalled();
  });

  it('falls back (ok=false) when the split fails', async () => {
    const d = deps({
      splitPptx: vi.fn(async () => ({
        success: false,
        slides: [],
        stdout: '',
        stderr: '',
        durationMs: 1,
        warnings: ['boom'],
      })),
    });
    const result = await generatePerSlideDeck(baseInput(), d);
    expect(result.ok).toBe(false);
    expect(result.slides).toEqual([]);
    expect(result.warnings.join(' ')).toContain('boom');
  });

  it('skips a slide that fails to export but keeps the rest (partial success)', async () => {
    const d = deps({
      exportSvg: vi.fn(async (i) =>
        i.pptxPath.endsWith('slide-2.pptx')
          ? {
              ...okExport(''),
              success: false,
              svgPath: null,
              warnings: ['export failed'],
            }
          : okExport(`${i.outputDir}/slide.svg`),
      ),
    });
    const result = await generatePerSlideDeck(baseInput(), d);
    expect(result.ok).toBe(true);
    expect(result.slides.map((s) => s.index)).toEqual([1, 3]);
    expect(result.warnings.join(' ')).toContain('export failed');
  });

  it('falls back (ok=false) when no slide could be persisted', async () => {
    const d = deps({
      composeSvg: vi.fn(async () => ({
        success: false,
        defsPath: null,
        slides: [],
        stdout: '',
        stderr: '',
        durationMs: 1,
        warnings: ['compose failed'],
      })),
    });
    const result = await generatePerSlideDeck(baseInput(), d);
    expect(result.ok).toBe(false);
    expect(result.slides).toEqual([]);
  });

  it('never throws — a throwing persistSlide degrades to a skipped slide', async () => {
    const d = deps({
      persistSlide: vi.fn(async (s) => {
        if (s.index === 2) throw new Error('s3 down');
        return {
          slug: s.slug,
          index: s.index,
          composeUrl: 'u',
          previewUrl: null,
          defsUrl: null,
        };
      }),
    });
    const result = await generatePerSlideDeck(baseInput(), d);
    expect(result.ok).toBe(true);
    expect(result.slides.map((s) => s.index)).toEqual([1, 3]);
    expect(result.warnings.join(' ')).toContain('s3 down');
  });
});

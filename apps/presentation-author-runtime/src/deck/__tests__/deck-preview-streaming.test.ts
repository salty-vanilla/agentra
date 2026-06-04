import type {
  ComposeSvgResult,
  ExportSvgResult,
  PerSlidePersistedSlide,
  SplitPptxResult,
} from '@agentra/presentation-author';
import type { DeckPreviewEvent } from '@agentra/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  type GenerateDeckPreviewStreamingDeps,
  generateDeckPreviewStreaming,
} from '../deck-preview-streaming.js';

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

function exportOk(svgPath: string): ExportSvgResult {
  return { success: true, svgPath, stdout: '', stderr: '', durationMs: 1, warnings: [] };
}

function composeOk(outputDir: string): ComposeSvgResult {
  return {
    success: true,
    defsPath: `${outputDir}/defs.json`,
    slides: [{ slug: 'slide', index: 1, composePath: `${outputDir}/slide.compose.json` }],
    stdout: '',
    stderr: '',
    durationMs: 1,
    warnings: [],
  };
}

function input() {
  return {
    pptxPath: '/work/deck.pptx',
    workDir: '/work',
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja' as const,
    bucketName: 'bucket',
  };
}

function deps(over: Partial<GenerateDeckPreviewStreamingDeps> = {}) {
  const events: DeckPreviewEvent[] = [];
  const base: GenerateDeckPreviewStreamingDeps = {
    s3Client: {} as never,
    splitPptx: vi.fn(async () => splitOk(3)),
    exportSvg: vi.fn(async (i) => exportOk(`${i.outputDir}/slide.svg`)),
    composeSvg: vi.fn(async (i) => composeOk(i.outputDir)),
    persistSlide: vi.fn(
      async (s): Promise<PerSlidePersistedSlide> => ({
        slug: s.slug,
        index: s.index,
        composeUrl: `https://cdn/${s.slug}.json?sig`,
        previewUrl: null,
        defsUrl: s.isFirst ? 'https://cdn/defs.json?sig' : null,
      }),
    ),
    onDeckEvent: (e) => events.push(e),
    ...over,
  };
  return { d: base, events };
}

describe('generateDeckPreviewStreaming', () => {
  it('emits started → compose_ready×N → completed in order and returns the deck', async () => {
    const { d, events } = deps();
    const result = await generateDeckPreviewStreaming(input(), d);

    expect(result.streamed).toBe(true);
    expect(events.map((e) => e.type)).toEqual([
      'deck_preview_started',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_preview_completed',
    ]);
    expect(result.deck?.slideOrder).toEqual(['slide-1', 'slide-2', 'slide-3']);
    expect(result.deck?.defsUrl).toBe('https://cdn/defs.json?sig');
  });

  it('repeats the shared defs URL on every slide event (late-join can render)', async () => {
    const { d, events } = deps();
    await generateDeckPreviewStreaming(input(), d);
    const composeReady = events.filter((e) => e.type === 'deck_slide_compose_ready');
    expect(composeReady).toHaveLength(3);
    for (const e of composeReady) {
      expect(e.type === 'deck_slide_compose_ready' && e.defsUrl).toBe(
        'https://cdn/defs.json?sig',
      );
    }
  });

  it('carries the slide count as totalSlides on the started event', async () => {
    const { d, events } = deps();
    await generateDeckPreviewStreaming(input(), d);
    const started = events.find((e) => e.type === 'deck_preview_started');
    expect(started?.type === 'deck_preview_started' && started.totalSlides).toBe(3);
  });

  it('degrades (streamed=false + failed event) when the split fails', async () => {
    const { d, events } = deps({
      splitPptx: vi.fn(async () => ({
        success: false,
        slides: [],
        stdout: '',
        stderr: '',
        durationMs: 1,
        warnings: ['boom'],
      })),
    });
    const result = await generateDeckPreviewStreaming(input(), d);
    expect(result.streamed).toBe(false);
    expect(result.deck).toBeUndefined();
    expect(events.at(-1)?.type).toBe('deck_preview_failed');
  });

  it('never throws — an export blowing up degrades to streamed=false', async () => {
    const { d } = deps({
      exportSvg: vi.fn(async () => {
        throw new Error('soffice exploded');
      }),
    });
    const result = await generateDeckPreviewStreaming(input(), d);
    expect(result.streamed).toBe(false);
    expect(result.warnings.join(' ')).toContain('soffice exploded');
  });
});

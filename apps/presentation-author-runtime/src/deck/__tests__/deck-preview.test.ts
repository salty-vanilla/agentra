import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeckResult } from '@agentra/presentation-author';
import type { DeckPreviewEvent } from '@agentra/shared';
import type { S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deriveDeckName,
  type GenerateDeckPreviewDeps,
  generateDeckPreview,
} from '../deck-preview.js';

let workDir: string;
const s3Client = {} as S3Client; // unused by injected stubs

const okExport: GenerateDeckPreviewDeps['exportSvg'] = vi.fn(async () => ({
  success: true,
  svgPath: '/tmp/deck/deck.svg',
  stdout: '',
  stderr: '',
  durationMs: 1,
  warnings: [],
}));

const okCompose: GenerateDeckPreviewDeps['composeSvg'] = vi.fn(async () => ({
  success: true,
  defsPath: '/tmp/deck/defs.json',
  slides: [{ slug: 'slide-1', index: 1, composePath: '/tmp/deck/slide-1.compose.json' }],
  stdout: '',
  stderr: '',
  durationMs: 1,
  warnings: [],
}));

const sampleDeck: DeckResult = {
  deckId: 'deck-1',
  name: 'Demo',
  language: 'ja',
  slideOrder: ['slide-1'],
  defsUrl: 'https://example.com/defs.json?sig',
  pptxDownloadUrl: null,
  specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
  slides: [
    { slug: 'slide-1', previewUrl: null, composeUrl: 'https://example.com/c.json?sig' },
  ],
  version: 1,
};

const okPersist: GenerateDeckPreviewDeps['persistDeck'] = vi.fn(async () => ({
  deck: sampleDeck,
  warnings: [],
}));

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'deck-preview-test-'));
});
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function baseInput() {
  return {
    pptxPath: join(workDir, 'deck.pptx'),
    workDir,
    deckId: 'deck-1',
    name: 'Demo',
    language: 'ja' as const,
    bucketName: 'my-bucket',
  };
}

describe('generateDeckPreview', () => {
  it('runs export → compose → persist and returns the deck', async () => {
    const r = await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: okExport,
      composeSvg: okCompose,
      persistDeck: okPersist,
    });
    expect(r.deck?.deckId).toBe('deck-1');
    expect(r.deck?.slides).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('degrades when SVG export fails (no deck, compose not reached)', async () => {
    const failExport: GenerateDeckPreviewDeps['exportSvg'] = vi.fn(async () => ({
      success: false,
      svgPath: null,
      stdout: '',
      stderr: '',
      durationMs: 1,
      warnings: ['soffice not found'],
    }));
    const localCompose = vi.fn(okCompose);
    const r = await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: failExport,
      composeSvg: localCompose,
      persistDeck: okPersist,
    });
    expect(r.deck).toBeUndefined();
    expect(r.warnings.join(' ')).toContain('SVG export failed');
    expect(localCompose).not.toHaveBeenCalled();
  });

  it('never throws: a persistDeck rejection degrades to no deck + warning', async () => {
    const throwingPersist: GenerateDeckPreviewDeps['persistDeck'] = vi.fn(async () => {
      throw new Error('S3 access denied');
    });
    const r = await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: okExport,
      composeSvg: okCompose,
      persistDeck: throwingPersist,
    });
    expect(r.deck).toBeUndefined();
    expect(r.warnings.join(' ')).toContain('S3 access denied');
  });

  it('degrades when compose produces no slides', async () => {
    const emptyCompose: GenerateDeckPreviewDeps['composeSvg'] = vi.fn(async () => ({
      success: true,
      defsPath: '/tmp/deck/defs.json',
      slides: [],
      stdout: '',
      stderr: '',
      durationMs: 1,
      warnings: [],
    }));
    const r = await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: okExport,
      composeSvg: emptyCompose,
      persistDeck: okPersist,
    });
    expect(r.deck).toBeUndefined();
    expect(r.warnings.join(' ')).toContain('no slides');
  });
});

describe('generateDeckPreview — onDeckEvent (Epic #403)', () => {
  it('emits started → compose_ready (per persisted slide) → completed on success', async () => {
    const events: DeckPreviewEvent[] = [];
    await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: okExport,
      composeSvg: okCompose,
      persistDeck: okPersist,
      onDeckEvent: (e) => events.push(e),
    });

    expect(events.map((e) => e.type)).toEqual([
      'deck_preview_started',
      'deck_slide_compose_ready',
      'deck_preview_completed',
    ]);
    const slide = events[1];
    if (slide?.type === 'deck_slide_compose_ready') {
      expect(slide.index).toBe(1);
      expect(slide.composeUrl).toBe('https://example.com/c.json?sig');
    }
  });

  it('emits started → failed (with reason) when SVG export fails', async () => {
    const failExport: GenerateDeckPreviewDeps['exportSvg'] = vi.fn(async () => ({
      success: false,
      svgPath: null,
      stdout: '',
      stderr: '',
      durationMs: 1,
      warnings: [],
    }));
    const events: DeckPreviewEvent[] = [];
    await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: failExport,
      composeSvg: okCompose,
      persistDeck: okPersist,
      onDeckEvent: (e) => events.push(e),
    });
    expect(events.map((e) => e.type)).toEqual([
      'deck_preview_started',
      'deck_preview_failed',
    ]);
    const failed = events[1];
    if (failed?.type === 'deck_preview_failed') {
      expect(failed.reason).toContain('SVG export failed');
    }
  });

  it('emits failed when persistDeck throws, and never propagates a throwing listener', async () => {
    const throwingPersist: GenerateDeckPreviewDeps['persistDeck'] = vi.fn(async () => {
      throw new Error('S3 access denied');
    });
    const events: DeckPreviewEvent[] = [];
    const r = await generateDeckPreview(baseInput(), {
      s3Client,
      exportSvg: okExport,
      composeSvg: okCompose,
      persistDeck: throwingPersist,
      // A listener that throws must not break the pipeline contract.
      onDeckEvent: (e) => {
        events.push(e);
        if (e.type === 'deck_preview_failed') throw new Error('listener boom');
      },
    });
    expect(r.deck).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual([
      'deck_preview_started',
      'deck_preview_failed',
    ]);
  });
});

describe('deriveDeckName', () => {
  it('uses the first non-empty line, capped at 80 chars', () => {
    expect(deriveDeckName('  Quarterly Review  \nmore')).toBe('Quarterly Review');
    expect(deriveDeckName('x'.repeat(100))).toHaveLength(80);
  });

  it('falls back to "presentation" for empty input', () => {
    expect(deriveDeckName('   \n  ')).toBe('presentation');
  });
});

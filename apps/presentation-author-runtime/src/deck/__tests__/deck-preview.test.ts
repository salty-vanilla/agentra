import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeckResult } from '@agentra/presentation-author';
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

describe('deriveDeckName', () => {
  it('uses the first non-empty line, capped at 80 chars', () => {
    expect(deriveDeckName('  Quarterly Review  \nmore')).toBe('Quarterly Review');
    expect(deriveDeckName('x'.repeat(100))).toHaveLength(80);
  });

  it('falls back to "presentation" for empty input', () => {
    expect(deriveDeckName('   \n  ')).toBe('presentation');
  });
});

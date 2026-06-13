import type { DeckResult, SdpmWorkspace } from '@agentra/presentation-author';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import type {
  GenerateDeckPreviewInput,
  GenerateDeckPreviewResult,
} from '../deck-preview.js';
import {
  type GenerateSdpmDeckPreviewDeps,
  generateSdpmDeckPreview,
} from '../sdpm-deck-preview.js';

const s3Client = {} as S3Client;

const deck: DeckResult = {
  deckId: 'deck-1',
  name: 'Demo',
  language: 'ja',
  slideOrder: ['slide-1'],
  defsUrl: null,
  pptxDownloadUrl: 'https://example.com/deck.pptx?sig',
  specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
  slides: [{ slug: 'slide-1', previewUrl: null, composeUrl: 'https://c?sig' }],
  version: 1,
};

function fakeWorkspace(): SdpmWorkspace {
  return {
    dir: '/ws',
    meta: {
      name: 'Demo',
      language: 'ja',
      template: 't',
      fonts: null,
      defaultTextColor: null,
    },
    files: {
      deckJsonPath: '/ws/deck.json',
      briefPath: '/ws/specs/brief.md',
      outlinePath: '/ws/specs/outline.md',
      artDirectionPath: null,
    },
    slides: [
      {
        slug: 'intro',
        index: 1,
        jsonPath: '/ws/slides/intro.json',
        title: 'X',
        layout: 'Blank',
      },
    ],
    warnings: ['deck.json minor warning'],
  };
}

const baseInput = {
  pptxPath: '/ws/deck.pptx',
  workspaceDir: '/ws',
  workDir: '/tmp/work',
  deckId: 'deck-1',
  name: 'Demo',
  language: 'ja' as const,
  bucketName: 'bucket',
};

describe('generateSdpmDeckPreview', () => {
  it('reads the SDPM workspace, passes extra upload items, and returns the deck', async () => {
    const generateDeckPreview = vi.fn(
      async (input: GenerateDeckPreviewInput): Promise<GenerateDeckPreviewResult> => {
        // The SDPM workspace files are forwarded as extra upload items.
        expect(input.extraUploadItems?.length).toBeGreaterThan(0);
        return { deck, warnings: ['compose warning'] };
      },
    );
    const deps: GenerateSdpmDeckPreviewDeps = {
      s3Client,
      readSdpmWorkspace: async () => fakeWorkspace(),
      generateDeckPreview,
    };

    const result = await generateSdpmDeckPreview(baseInput, deps);

    expect(result.deck).toBe(deck);
    // Workspace + compose warnings are merged.
    expect(result.warnings).toContain('deck.json minor warning');
    expect(result.warnings).toContain('compose warning');
    expect(generateDeckPreview).toHaveBeenCalledOnce();
  });

  it('degrades to a PPTX-only result when reading the workspace throws', async () => {
    const generateDeckPreview = vi.fn(
      async (input: GenerateDeckPreviewInput): Promise<GenerateDeckPreviewResult> => {
        expect(input.extraUploadItems).toEqual([]);
        return { deck, warnings: [] };
      },
    );
    const deps: GenerateSdpmDeckPreviewDeps = {
      s3Client,
      readSdpmWorkspace: async () => {
        throw new Error('disk gone');
      },
      generateDeckPreview,
    };

    const result = await generateSdpmDeckPreview(baseInput, deps);

    expect(result.deck).toBe(deck);
    expect(result.warnings.some((w) => w.includes('SDPM workspace sync skipped'))).toBe(
      true,
    );
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImageToolGuidance } from '../images/prompts.js';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageRetrievalProvider,
  ImageSearchRequest,
  RetrievedImage,
} from '../images/types.js';
import { prepareImageAssetsForWorkspace } from '../images/workspace.js';

// ---------------------------------------------------------------------------
// Fake providers for DI testing
// ---------------------------------------------------------------------------

function createFakeRetrievalProvider(
  images: RetrievedImage[] = [],
): ImageRetrievalProvider {
  return {
    id: 'pexels',
    search: vi.fn(async (_req: ImageSearchRequest) => images),
    download: vi.fn(async (image: RetrievedImage, workDir: string) => {
      const dir = join(workDir, 'assets', 'images', 'retrieved');
      await mkdir(dir, { recursive: true });
      const filename = `${image.id}.jpg`;
      const dest = join(dir, filename);
      await writeFile(dest, 'fake-image-bytes');
      return { ...image, localPath: `assets/images/retrieved/${filename}` };
    }),
  };
}

function createFakeGenerationProvider(result?: GeneratedImage): ImageGenerationProvider {
  return {
    id: 'bedrock',
    generate: vi.fn(async (req: ImageGenerationRequest) => {
      if (result) return result;
      const id = 'gen-001';
      const dir = join(process.cwd(), 'assets', 'images', 'generated');
      await mkdir(dir, { recursive: true });
      const localPath = `assets/images/generated/${id}.png`;
      return {
        id,
        provider: 'bedrock' as const,
        prompt: req.prompt,
        localPath,
        width: 1408,
        height: 768,
      };
    }),
  };
}

const sampleRetrievedImages: RetrievedImage[] = [
  {
    id: '12345',
    provider: 'pexels',
    title: 'Factory floor',
    authorName: 'Photo Author',
    sourceUrl: 'https://pexels.com/photo/12345',
    downloadUrl: 'https://images.pexels.com/12345.jpg',
    width: 1920,
    height: 1080,
    license: 'Pexels License (free)',
    attribution: 'Photo by Photo Author on Pexels',
  },
  {
    id: '67890',
    provider: 'pexels',
    title: 'Business meeting',
    authorName: 'Meeting Author',
    sourceUrl: 'https://pexels.com/photo/67890',
    downloadUrl: 'https://images.pexels.com/67890.jpg',
    width: 1920,
    height: 1280,
    license: 'Pexels License (free)',
    attribution: 'Photo by Meeting Author on Pexels',
  },
];

// ---------------------------------------------------------------------------
// Test workspace helper
// ---------------------------------------------------------------------------

let testWorkDir: string;

afterEach(async () => {
  if (testWorkDir && existsSync(testWorkDir)) {
    await rm(testWorkDir, { recursive: true, force: true });
  }
});

async function createTestWorkDir(): Promise<string> {
  testWorkDir = join(tmpdir(), `pa-images-test-${Date.now()}`);
  await mkdir(testWorkDir, { recursive: true });
  return testWorkDir;
}

// ---------------------------------------------------------------------------
// Type tests
// ---------------------------------------------------------------------------

describe('Image provider types', () => {
  it('RetrievedImage has expected fields', () => {
    const img: RetrievedImage = {
      id: '1',
      provider: 'pexels',
      title: 'test',
      downloadUrl: 'https://example.com/img.jpg',
    };
    expect(img.provider).toBe('pexels');
    expect(img.id).toBe('1');
  });

  it('GeneratedImage has expected fields', () => {
    const img: GeneratedImage = {
      id: '1',
      provider: 'bedrock',
      prompt: 'abstract concept',
      localPath: 'assets/images/generated/1.png',
    };
    expect(img.provider).toBe('bedrock');
    expect(img.localPath).toContain('generated');
  });

  it('ImageRetrievalProvider interface is implementable', () => {
    const provider = createFakeRetrievalProvider();
    expect(provider.id).toBe('pexels');
    expect(typeof provider.search).toBe('function');
    expect(typeof provider.download).toBe('function');
  });

  it('ImageGenerationProvider interface is implementable', () => {
    const provider = createFakeGenerationProvider();
    expect(provider.id).toBe('bedrock');
    expect(typeof provider.generate).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Workspace preparation tests
// ---------------------------------------------------------------------------

describe('prepareImageAssetsForWorkspace', () => {
  it('returns empty when disabled', async () => {
    const workDir = await createTestWorkDir();
    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'test',
      images: { retrievalEnabled: false },
    });
    expect(result.retrievedImages).toEqual([]);
    expect(result.generatedImages).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns empty when mode=none', async () => {
    const workDir = await createTestWorkDir();
    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'test',
      images: { retrievalEnabled: false },
    });
    expect(result.retrievedImages).toEqual([]);
    expect(result.generatedImages).toEqual([]);
  });

  it('returns empty when images config is omitted', async () => {
    const workDir = await createTestWorkDir();
    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'test',
    });
    expect(result.retrievedImages).toEqual([]);
    expect(result.generatedImages).toEqual([]);
  });

  it('mode=retrieve uses retrieval provider', async () => {
    const workDir = await createTestWorkDir();
    const provider = createFakeRetrievalProvider(sampleRetrievedImages);

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory manufacturing process',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: provider,
    });

    expect(result.retrievedImages.length).toBe(2);
    expect(result.retrievedImages[0]!.localPath).toContain('retrieved');
    expect(provider.search).toHaveBeenCalledOnce();
    expect(provider.download).toHaveBeenCalledTimes(2);
  });

  it('mode=generate uses generation provider', async () => {
    const workDir = await createTestWorkDir();
    const provider = createFakeGenerationProvider();

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract AI automation concept',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageGenerationProvider: provider,
    });

    expect(result.generatedImages.length).toBe(1);
    expect(result.generatedImages[0]!.localPath).toContain('generated');
    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it('mode=auto prefers retrieval for business/factory prompt', async () => {
    const workDir = await createTestWorkDir();
    const retrievalProvider = createFakeRetrievalProvider(sampleRetrievedImages);
    const generationProvider = createFakeGenerationProvider();

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory production line improvement',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageRetrievalProvider: retrievalProvider,
      imageGenerationProvider: generationProvider,
    });

    expect(result.retrievedImages.length).toBe(2);
    expect(result.generatedImages.length).toBe(0);
  });

  it('mode=auto falls back to generation when retrieval returns empty', async () => {
    const workDir = await createTestWorkDir();
    const retrievalProvider = createFakeRetrievalProvider([]); // empty results
    const generationProvider = createFakeGenerationProvider();

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract AI network digital transformation',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageRetrievalProvider: retrievalProvider,
      imageGenerationProvider: generationProvider,
    });

    expect(result.retrievedImages.length).toBe(0);
    expect(result.generatedImages.length).toBe(1);
  });

  it('mode=auto uses retrieval when results are available', async () => {
    const workDir = await createTestWorkDir();
    const retrievalProvider = createFakeRetrievalProvider(sampleRetrievedImages);
    const generationProvider = createFakeGenerationProvider();

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract AI network digital transformation',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageRetrievalProvider: retrievalProvider,
      imageGenerationProvider: generationProvider,
    });

    expect(result.retrievedImages.length).toBe(2);
    expect(result.generatedImages.length).toBe(0);
  });

  it('warns when retrieval requested but no provider', async () => {
    const workDir = await createTestWorkDir();
    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory production line',
      images: { retrievalEnabled: true },
    });

    expect(result.warnings).toContain(
      'Image retrieval requested but no provider available',
    );
  });

  it('warns when generation requested but no provider', async () => {
    const workDir = await createTestWorkDir();
    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract AI concept',
      images: { retrievalEnabled: true, generationEnabled: true },
    });

    expect(result.warnings).toContain(
      'Image generation requested but no provider available',
    );
  });

  it('handles retrieval failure gracefully', async () => {
    const workDir = await createTestWorkDir();
    const provider: ImageRetrievalProvider = {
      id: 'pexels',
      search: vi.fn(async () => {
        throw new Error('API rate limit');
      }),
      download: vi.fn(),
    };

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: provider,
    });

    expect(result.retrievedImages).toEqual([]);
    expect(result.warnings[0]).toContain('Image retrieval failed');
  });

  it('handles generation failure gracefully', async () => {
    const workDir = await createTestWorkDir();
    const provider: ImageGenerationProvider = {
      id: 'bedrock',
      generate: vi.fn(async () => {
        throw new Error('Model not available');
      }),
    };

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract concept',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageGenerationProvider: provider,
    });

    expect(result.generatedImages).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Image generation failed')]),
    );
  });

  it('handles individual download failure gracefully', async () => {
    const workDir = await createTestWorkDir();
    const provider: ImageRetrievalProvider = {
      id: 'pexels',
      search: vi.fn(async () => sampleRetrievedImages),
      download: vi.fn(async () => {
        throw new Error('Download timeout');
      }),
    };

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: provider,
    });

    expect(result.retrievedImages).toEqual([]);
    expect(result.warnings.length).toBe(2);
    expect(result.warnings[0]).toContain('Failed to download image');
  });

  it('creates asset directories', async () => {
    const workDir = await createTestWorkDir();
    const provider = createFakeRetrievalProvider(sampleRetrievedImages);

    await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: provider,
    });

    expect(existsSync(join(workDir, 'assets', 'images', 'retrieved'))).toBe(true);
    expect(existsSync(join(workDir, 'assets', 'images', 'generated'))).toBe(true);
  });

  it('downloaded files exist on disk', async () => {
    const workDir = await createTestWorkDir();
    const provider = createFakeRetrievalProvider(sampleRetrievedImages);

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: provider,
    });

    for (const img of result.retrievedImages) {
      expect(img.localPath).toBeTruthy();
      const fullPath = join(workDir, img.localPath!);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  it('respects maxResults from config', async () => {
    const workDir = await createTestWorkDir();
    const provider = createFakeRetrievalProvider(sampleRetrievedImages);

    await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'factory',
      images: {
        retrievalEnabled: true,
        retrieval: { maxResults: 10 },
      },
      imageRetrievalProvider: provider,
    });

    const searchCall = (provider.search as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(searchCall.maxResults).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Prompt injection tests
// ---------------------------------------------------------------------------

describe('buildImageToolGuidance', () => {
  it('auto mode contains both search and generate instructions', () => {
    const guidance = buildImageToolGuidance('auto');
    expect(guidance).toContain('search_image');
    expect(guidance).toContain('generate_image');
    expect(guidance).toContain('BrandFrame safe area');
    expect(guidance).toContain('slide.addImage');
    expect(guidance).toContain('Real-world subjects');
    expect(guidance).toContain('Abstract concepts');
  });

  it('retrieve mode only mentions search_image', () => {
    const guidance = buildImageToolGuidance('retrieve');
    expect(guidance).toContain('search_image');
    expect(guidance).toContain('Do NOT attempt to call generate_image');
    expect(guidance).not.toContain('Abstract concepts');
  });

  it('generate mode only mentions generate_image', () => {
    const guidance = buildImageToolGuidance('generate');
    expect(guidance).toContain('generate_image');
    expect(guidance).toContain('Do NOT attempt to call search_image');
    expect(guidance).not.toContain('Real-world subjects');
  });

  it('emphasizes using exact returned paths', () => {
    const guidance = buildImageToolGuidance('retrieve');
    expect(guidance).toContain('EXACT returned path');
  });
});

// ---------------------------------------------------------------------------
// DI tests
// ---------------------------------------------------------------------------

describe('DI: custom providers', () => {
  it('injected retrieval provider is used', async () => {
    const workDir = await createTestWorkDir();
    const customProvider = createFakeRetrievalProvider([
      {
        id: 'custom-1',
        provider: 'company-library',
        title: 'Internal photo',
        downloadUrl: 'https://internal.example.com/photo.jpg',
      },
    ]);
    // Override provider id
    (customProvider as { id: string }).id = 'company-library';

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'company event',
      images: { retrievalEnabled: true },
      imageRetrievalProvider: customProvider,
    });

    expect(customProvider.search).toHaveBeenCalledOnce();
    expect(result.retrievedImages.length).toBe(1);
  });

  it('injected generation provider is used', async () => {
    const workDir = await createTestWorkDir();
    const customProvider: ImageGenerationProvider = {
      id: 'stability',
      generate: vi.fn(async (req) => ({
        id: 'stability-1',
        provider: 'stability' as const,
        prompt: req.prompt,
        localPath: 'assets/images/generated/stability-1.png',
      })),
    };

    const result = await prepareImageAssetsForWorkspace({
      workDir,
      prompt: 'abstract gradient background',
      images: { retrievalEnabled: true, generationEnabled: true },
      imageGenerationProvider: customProvider,
    });

    expect(customProvider.generate).toHaveBeenCalledOnce();
    expect(result.generatedImages.length).toBe(1);
    expect(result.generatedImages[0]!.provider).toBe('stability');
  });
});

// ---------------------------------------------------------------------------
// Pexels provider unit tests (mocked HTTP)
// ---------------------------------------------------------------------------

describe('PexelsImageRetrievalProvider', () => {
  it('throws when API key is empty', async () => {
    const { PexelsImageRetrievalProvider } = await import('../images/pexels-provider.js');
    const provider = new PexelsImageRetrievalProvider('');
    await expect(provider.search({ query: 'factory' })).rejects.toThrow(
      'PEXELS_API_KEY is empty',
    );
  });
});

// ---------------------------------------------------------------------------
// Result metadata tests
// ---------------------------------------------------------------------------

describe('ImageResultMetadata', () => {
  it('can represent disabled state', () => {
    const meta = { retrievalEnabled: false } as const;
    expect(meta.retrievalEnabled).toBe(false);
  });

  it('can represent enabled state with counts', () => {
    const meta = {
      retrievalEnabled: true,
      generationEnabled: true,
      retrievalProviderId: 'pexels',
      generationProviderId: 'bedrock',
      generationModelId: 'amazon.titan-image-generator-v2:0',
      retrievedCount: 3,
      generatedCount: 1,
      warnings: ['Some warning'],
    };
    expect(meta.retrievalEnabled).toBe(true);
    expect(meta.retrievedCount).toBe(3);
    expect(meta.generatedCount).toBe(1);
  });
});

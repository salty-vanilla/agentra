import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolDefinition, ToolHandler } from '../types.js';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  ImageRetrievalProvider,
  RetrievedImage,
} from './types.js';

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const IMAGE_SEARCH_TOOL: ToolDefinition = {
  name: 'search_image',
  description:
    'Search for a stock photo on Pexels. Use for real-world imagery: people, places, objects, nature, events. Returns local file paths you can use in addImage().',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'English search keywords for stock photos (e.g. "japanese carp streamers blue sky", "business meeting office"). Keep concise, 2-5 words.',
      },
      orientation: {
        type: 'string',
        enum: ['landscape', 'portrait', 'square'],
        description: 'Image orientation. Default: landscape.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum images to return (1-5). Default: 2.',
      },
    },
    required: ['query'],
  },
};

export const IMAGE_GENERATE_TOOL: ToolDefinition = {
  name: 'generate_image',
  description:
    'Generate an image using AI (Bedrock Nova Canvas). Use for abstract concepts, unique visuals, custom illustrations that stock photos cannot provide. Returns a local file path.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'Detailed English description of the image to generate. Be specific about style, colors, composition (e.g. "Abstract blue neural network with glowing nodes, dark background, professional corporate style").',
      },
      aspectRatio: {
        type: 'string',
        enum: ['16:9', '4:3', '1:1'],
        description: 'Aspect ratio. Default: 16:9.',
      },
      style: {
        type: 'string',
        description:
          'Style keywords (e.g. "professional, clean, corporate"). Default: professional, clean, modern.',
      },
    },
    required: ['prompt'],
  },
};

// ---------------------------------------------------------------------------
// Tool Result Types (what the LLM sees back)
// ---------------------------------------------------------------------------

export interface ImageSearchResult {
  images: Array<{
    path: string;
    description: string;
    attribution?: string;
  }>;
}

export interface ImageGenerateResult {
  image: {
    path: string;
    description: string;
  };
}

// ---------------------------------------------------------------------------
// Tool Handler Factories
// ---------------------------------------------------------------------------

export interface ImageToolAccumulator {
  retrievedImages: RetrievedImage[];
  generatedImages: GeneratedImage[];
  warnings: string[];
}

export function createImageSearchHandler(
  provider: ImageRetrievalProvider,
  workDir: string,
  accumulator: ImageToolAccumulator,
): ToolHandler {
  return async (rawInput: unknown): Promise<ImageSearchResult> => {
    const input = rawInput as {
      query: string;
      orientation?: 'landscape' | 'portrait' | 'square';
      maxResults?: number;
    };

    // Ensure directory exists
    const retrievedDir = join(workDir, 'assets', 'images', 'retrieved');
    await mkdir(retrievedDir, { recursive: true });

    let results: Awaited<ReturnType<typeof provider.search>>;
    try {
      results = await provider.search({
        query: input.query,
        orientation: input.orientation ?? 'landscape',
        maxResults: Math.min(input.maxResults ?? 2, 5),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      accumulator.warnings.push(`search_image failed: ${msg}`);
      return { images: [{ path: '', description: `Search failed: ${msg}` }] };
    }

    if (results.length === 0) {
      accumulator.warnings.push(
        `search_image returned 0 results for query "${input.query}"`,
      );
      return {
        images: [{ path: '', description: `No results found for: ${input.query}` }],
      };
    }

    const images: ImageSearchResult['images'] = [];

    for (const img of results) {
      try {
        const downloaded = await provider.download(img, workDir);
        if (!downloaded.localPath) {
          accumulator.warnings.push(
            `Image ${img.id} downloaded but localPath is missing (download may have failed silently)`,
          );
          continue;
        }
        accumulator.retrievedImages.push(downloaded);
        images.push({
          path: `./${downloaded.localPath}`,
          description: downloaded.title ?? `Stock photo: ${input.query}`,
          ...(downloaded.attribution ? { attribution: downloaded.attribution } : {}),
        });
      } catch (err) {
        accumulator.warnings.push(
          `Failed to download image ${img.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (images.length === 0) {
      return {
        images: [{ path: '', description: `No results found for: ${input.query}` }],
      };
    }

    return { images };
  };
}

export function createImageGenerateHandler(
  provider: ImageGenerationProvider,
  workDir: string,
  accumulator: ImageToolAccumulator,
): ToolHandler {
  return async (
    rawInput: unknown,
  ): Promise<ImageGenerateResult | { error: string; hint: string }> => {
    const input = rawInput as {
      prompt: string;
      aspectRatio?: '16:9' | '4:3' | '1:1';
      style?: string;
    };

    // Ensure directory exists
    const generatedDir = join(workDir, 'assets', 'images', 'generated');
    await mkdir(generatedDir, { recursive: true });

    try {
      const generated = await provider.generate({
        prompt: input.prompt,
        workDir,
        aspectRatio: input.aspectRatio ?? '16:9',
        style: input.style ?? 'professional, clean, modern',
        usage: 'illustration',
      });

      accumulator.generatedImages.push(generated);

      return {
        image: {
          path: `./${generated.localPath}`,
          description: input.prompt.slice(0, 80),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      accumulator.warnings.push(`generate_image failed: ${message}`);
      return {
        error: message,
        hint: 'Image generation is unavailable. Do NOT call generate_image again. Continue writing the presentation without generated images — use solid color backgrounds or placeholder rectangles instead.',
      };
    }
  };
}

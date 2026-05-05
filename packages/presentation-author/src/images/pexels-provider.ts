import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  ImageRetrievalProvider,
  ImageSearchRequest,
  RetrievedImage,
} from './types.js';

const PEXELS_API_BASE = 'https://api.pexels.com/v1';

export function createDefaultPexelsProvider(
  apiKey?: string,
): PexelsImageRetrievalProvider {
  const key = apiKey ?? process.env.PEXELS_API_KEY ?? '';
  return new PexelsImageRetrievalProvider(key);
}

export class PexelsImageRetrievalProvider implements ImageRetrievalProvider {
  readonly id = 'pexels' as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(request: ImageSearchRequest): Promise<RetrievedImage[]> {
    if (!this.apiKey) {
      throw new Error('Pexels API key is not configured (PEXELS_API_KEY is empty)');
    }

    const params = new URLSearchParams({
      query: request.query,
      per_page: String(request.maxResults ?? 5),
    });

    if (request.orientation) {
      params.set('orientation', request.orientation);
    }

    const url = `${PEXELS_API_BASE}/search?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels API search failed: HTTP ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as PexelsSearchResponse;

    return (data.photos ?? []).map((photo, idx) => ({
      id: String(photo.id),
      provider: 'pexels' as const,
      title: photo.alt ?? undefined,
      authorName: photo.photographer ?? undefined,
      sourceUrl: photo.url ?? undefined,
      downloadUrl: photo.src?.large2x ?? photo.src?.large ?? photo.src?.original,
      width: photo.width,
      height: photo.height,
      license: 'Pexels License (free)',
      attribution: photo.photographer
        ? `Photo by ${photo.photographer} on Pexels`
        : 'Pexels',
      score: data.photos.length - idx,
    }));
  }

  async download(image: RetrievedImage, workDir: string): Promise<RetrievedImage> {
    if (!image.downloadUrl) {
      throw new Error(`Image ${image.id} has no downloadUrl`);
    }

    const dir = join(workDir, 'assets', 'images', 'retrieved');
    await mkdir(dir, { recursive: true });

    const ext = guessExtension(image.downloadUrl);
    const filename = `${sanitizeFilename(image.id)}.${ext}`;
    const dest = join(dir, filename);

    const res = await fetch(image.downloadUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to download image ${image.id}: HTTP ${res.status} ${res.statusText}`,
      );
    }
    if (!res.body) {
      throw new Error(`Failed to download image ${image.id}: empty response body`);
    }

    const writeStream = createWriteStream(dest);
    // Node 18+ fetch body → Readable via Readable.fromWeb
    const { Readable } = await import('node:stream');
    const readable = Readable.fromWeb(
      res.body as import('node:stream/web').ReadableStream,
    );
    await pipeline(readable, writeStream);

    return {
      ...image,
      localPath: `assets/images/retrieved/${filename}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function guessExtension(url: string): string {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith('.png')) return 'png';
  if (pathname.endsWith('.webp')) return 'webp';
  return 'jpg';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

// ---------------------------------------------------------------------------
// Pexels API response types (minimal)
// ---------------------------------------------------------------------------

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  alt?: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
  };
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
}

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrandFrame } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_BRAND_FRAME_ID = 'company-basic-v1';

const TEMPLATES_ROOT = join(__dirname, '..', '..', 'templates');

export async function loadBrandFrame(id?: string): Promise<BrandFrame> {
  const frameId = id ?? DEFAULT_BRAND_FRAME_ID;
  const manifestPath = join(TEMPLATES_ROOT, frameId, 'manifest.json');

  try {
    const raw = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as BrandFrame;

    if (!manifest.id || !manifest.name || !manifest.safeArea || !manifest.slideSize) {
      throw new Error(
        `Invalid BrandFrame manifest: missing required fields in ${frameId}`,
      );
    }

    return manifest;
  } catch (err) {
    if (frameId !== DEFAULT_BRAND_FRAME_ID) {
      console.warn(
        `BrandFrame "${frameId}" not found, falling back to "${DEFAULT_BRAND_FRAME_ID}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return loadBrandFrame(DEFAULT_BRAND_FRAME_ID);
    }
    throw new Error(
      `Failed to load default BrandFrame "${DEFAULT_BRAND_FRAME_ID}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function getBrandFrameTemplateDir(id?: string): string {
  return join(TEMPLATES_ROOT, id ?? DEFAULT_BRAND_FRAME_ID);
}

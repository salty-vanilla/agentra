import { readFile } from 'node:fs/promises';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DeckResult } from './types.js';
import type { DeckMeta, DeckWorkspace } from './workspace.js';

const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600;

export interface PersistDeckInput {
  workspace: DeckWorkspace;
  meta: DeckMeta;
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
}

export interface PersistDeckDeps {
  s3Client: S3Client;
}

export interface PersistDeckResult {
  deck: DeckResult;
  warnings: string[];
}

async function loadBody(
  source: DeckWorkspace['items'][number]['source'],
): Promise<Uint8Array | string> {
  if (source.kind === 'inline') return source.body;
  return readFile(source.localPath);
}

/**
 * Upload a deck workspace to `decks/{deckId}/...` and assemble a DeckResult with
 * presigned URLs.
 *
 * Degrades gracefully: a failed upload or presign for any item leaves the
 * corresponding URL `null` and records a warning, rather than throwing — the
 * deck preview is optional and must never break the PPTX result.
 */
export async function persistDeck(
  input: PersistDeckInput,
  deps: PersistDeckDeps,
): Promise<PersistDeckResult> {
  const { workspace, meta, bucketName } = input;
  const expiresIn = input.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS;
  const { s3Client } = deps;

  const warnings: string[] = [];
  const uploaded = new Set<string>();

  for (const item of workspace.items) {
    try {
      const body = await loadBody(item.source);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: item.key,
          Body: body,
          ContentType: item.contentType,
          Metadata: { deckId: workspace.deckId, role: item.role },
        }),
      );
      uploaded.add(item.key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to upload ${item.role} (${item.key}): ${msg}`);
    }
  }

  async function presign(key: string | null): Promise<string | null> {
    if (!key || !uploaded.has(key)) return null;
    try {
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to presign ${key}: ${msg}`);
      return null;
    }
  }

  const [defsUrl, outlineUrl, pptxDownloadUrl] = await Promise.all([
    presign(workspace.keys.defs),
    presign(workspace.keys.outline),
    presign(workspace.keys.pptx),
  ]);

  const slides = await Promise.all(
    workspace.manifests.map(async (m) => ({
      slug: m.slug,
      previewUrl: await presign(m.previewKey),
      composeUrl: await presign(m.composeKey),
    })),
  );

  const deck: DeckResult = {
    deckId: workspace.deckId,
    name: meta.name,
    language: meta.language,
    slideOrder: workspace.slideOrder,
    defsUrl,
    pptxDownloadUrl,
    specs: { briefUrl: null, outlineUrl, artDirectionUrl: null },
    slides,
    version: 1,
  };

  return { deck, warnings };
}

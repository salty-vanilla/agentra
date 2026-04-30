import { access, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Asset, PresentationIR } from '@deck-forge/core';
import { materializeGeneratedAssets } from '@deck-forge/core';
import { buildImageGenerators, getOrCreateRuntime } from './create-runner.js';
import { getLogger } from './logging.js';

export type DeckForgeArtifact =
  | {
      localPath?: string;
      exists: boolean;
      s3Uri?: string;
      presignedUrl?: string;
      expiresIn?: number;
      bundleS3Uri?: string;
      bundlePresignedUrl?: string;
      irS3Uri?: string;
      requestS3Uri?: string;
      assetCount?: number;
    }
  | undefined;

const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

type PublishInput = {
  presentation: PresentationIR | undefined;
  outputPath: string | undefined;
  runId: string;
  format: 'pptx' | 'html' | 'json' | 'pdf';
  request: unknown;
  result: unknown;
};

/**
 * Persist the deck artifact (pptx/html/...) and a full reproducibility bundle
 * to S3:
 *   s3://bucket/<prefix>/<runId>/
 *     deck.<format>          - the rendered presentation (when applicable)
 *     run-bundle.json        - full runner result (artifacts + trace + revision)
 *     presentation.ir.json   - the PresentationIR alone (for re-export / diff)
 *     input-request.json     - the original DeckForgeRequest
 *     assets/<assetId>.<ext> - every image/diagram referenced by the IR,
 *                              with the IR's `assets[].uri` rewritten to the S3 URI
 */
export async function publishArtifactIfNeeded(
  input: PublishInput,
): Promise<DeckForgeArtifact> {
  const bucket = process.env.DECK_FORGE_ARTIFACT_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim() || process.env.BEDROCK_REGION?.trim();
  const client = new S3Client(region ? { region } : {});
  const prefix = normalizePrefix(process.env.DECK_FORGE_ARTIFACT_PREFIX ?? 'deck-forge/');
  const runPrefix = `${prefix}${input.runId}/`;

  // 1) Render and upload the deck binary (pptx only — html/json/pdf already in result.exportResult)
  let deckArtifact: NonNullable<DeckForgeArtifact> = { exists: false };
  // Materialize `generated://` virtual asset URIs into real on-disk files so that
  // (a) the saved IR points at concrete files we can upload to S3, and
  // (b) the pptx export and the bundle reference the exact same bytes.
  let materializedPresentation: PresentationIR | undefined = input.presentation;
  if (input.presentation && input.outputPath) {
    const outputDir = dirname(input.outputPath);
    try {
      materializedPresentation = await materializeGeneratedAssets(input.presentation, {
        outputDir,
        generators: buildImageGenerators(),
        fallbackPolicy: 'local-file',
        safety: { allowOutsideWorkspace: true },
      });
    } catch (error) {
      getLogger().warn(
        { error: String(error) },
        '[deck-forge-runtime] [artifact] materializeGeneratedAssets failed; uploading IR with virtual uris',
      );
    }
  }

  if (
    input.outputPath &&
    input.format === 'pptx' &&
    materializedPresentation !== undefined
  ) {
    const runtime = getOrCreateRuntime();
    await runtime.export(materializedPresentation, {
      format: input.format,
      outputPath: input.outputPath,
    });

    const exists = await pathExists(input.outputPath);
    deckArtifact = { localPath: input.outputPath, exists };

    if (exists && bucket) {
      const key = `${runPrefix}deck.${input.format}`;
      const body = await readFile(input.outputPath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }),
      );
      const presignedUrl = await presign(client, bucket, key);
      deckArtifact = {
        ...deckArtifact,
        s3Uri: `s3://${bucket}/${key}`,
        presignedUrl,
        expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
      };
    }
  }

  if (!bucket) {
    return deckArtifact.exists || deckArtifact.localPath ? deckArtifact : undefined;
  }

  // 2) Upload referenced assets (images etc.) and rewrite IR uris to S3
  let assetCount = 0;
  let republishedPresentation: PresentationIR | undefined = materializedPresentation;
  if (materializedPresentation?.assets?.assets?.length) {
    const { presentation: rewritten, count } = await uploadAssetsAndRewriteIr({
      presentation: materializedPresentation,
      bucket,
      runPrefix,
      client,
    });
    republishedPresentation = rewritten;
    assetCount = count;
  }

  // 3) Upload presentation.ir.json (with rewritten asset uris)
  let irS3Uri: string | undefined;
  if (republishedPresentation) {
    const irKey = `${runPrefix}presentation.ir.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: irKey,
        Body: JSON.stringify(republishedPresentation, null, 2),
        ContentType: 'application/json',
      }),
    );
    irS3Uri = `s3://${bucket}/${irKey}`;
  }

  // 4) Upload input-request.json
  const requestKey = `${runPrefix}input-request.json`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: requestKey,
      Body: JSON.stringify(input.request, null, 2),
      ContentType: 'application/json',
    }),
  );
  const requestS3Uri = `s3://${bucket}/${requestKey}`;

  // 5) Upload run-bundle.json (the full runner result, with rewritten IR)
  const bundleKey = `${runPrefix}run-bundle.json`;
  const bundleBody = JSON.stringify(
    {
      runId: input.runId,
      generatedAt: new Date().toISOString(),
      request: input.request,
      result: rewriteResultPresentation(input.result, republishedPresentation),
    },
    null,
    2,
  );
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: bundleKey,
      Body: bundleBody,
      ContentType: 'application/json',
    }),
  );
  const bundleS3Uri = `s3://${bucket}/${bundleKey}`;
  const bundlePresignedUrl = await presign(client, bucket, bundleKey);

  return {
    ...deckArtifact,
    bundleS3Uri,
    bundlePresignedUrl,
    ...(irS3Uri !== undefined ? { irS3Uri } : {}),
    requestS3Uri,
    assetCount,
  };
}

async function uploadAssetsAndRewriteIr(input: {
  presentation: PresentationIR;
  bucket: string;
  runPrefix: string;
  client: S3Client;
}): Promise<{ presentation: PresentationIR; count: number }> {
  const log = getLogger();
  const { presentation, bucket, runPrefix, client } = input;
  const rewrittenAssets: Asset[] = [];
  let count = 0;

  for (const asset of presentation.assets.assets) {
    try {
      const fetched = await fetchAssetBytes(asset.uri);
      if (!fetched) {
        rewrittenAssets.push(asset);
        continue;
      }
      const ext = guessExtension(asset.mimeType, asset.uri);
      const key = `${runPrefix}assets/${asset.id}${ext}`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fetched.body,
          ContentType:
            asset.mimeType || fetched.contentType || 'application/octet-stream',
        }),
      );
      const s3Uri = `s3://${bucket}/${key}`;
      rewrittenAssets.push({
        ...asset,
        uri: s3Uri,
        metadata: {
          ...asset.metadata,
          sourcePageUrl: asset.metadata.sourcePageUrl ?? asset.uri,
        },
      });
      count += 1;
    } catch (error) {
      log.warn(
        { assetId: asset.id, uri: asset.uri, error: String(error) },
        '[deck-forge-runtime] [artifact] failed to upload asset; keeping original uri',
      );
      rewrittenAssets.push(asset);
    }
  }

  return {
    presentation: {
      ...presentation,
      assets: { assets: rewrittenAssets },
    },
    count,
  };
}

async function fetchAssetBytes(
  uri: string,
): Promise<{ body: Buffer; contentType?: string } | undefined> {
  if (!uri) return undefined;

  if (uri.startsWith('s3://')) {
    // Already in S3 — skip re-upload.
    return undefined;
  }

  if (uri.startsWith('file://') || uri.startsWith('/')) {
    const path = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
    const body = await readFile(path);
    return { body };
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`http ${res.status} fetching ${uri}`);
    }
    const contentType = res.headers.get('content-type') ?? undefined;
    const arrayBuffer = await res.arrayBuffer();
    return contentType !== undefined
      ? { body: Buffer.from(arrayBuffer), contentType }
      : { body: Buffer.from(arrayBuffer) };
  }

  if (uri.startsWith('data:')) {
    const match = uri.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return undefined;
    const contentType = match[1];
    return contentType !== undefined
      ? { body: Buffer.from(match[2] ?? '', 'base64'), contentType }
      : { body: Buffer.from(match[2] ?? '', 'base64') };
  }

  return undefined;
}

function guessExtension(mimeType: string | undefined, uri: string): string {
  const fromMime: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
  };
  if (mimeType && fromMime[mimeType]) return fromMime[mimeType];
  const m = uri.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/);
  return m ? `.${m[1]?.toLowerCase()}` : '';
}

function rewriteResultPresentation(
  result: unknown,
  presentation: PresentationIR | undefined,
): unknown {
  if (
    !presentation ||
    typeof result !== 'object' ||
    result === null ||
    !('artifacts' in result)
  ) {
    return result;
  }
  const r = result as { artifacts?: { presentation?: PresentationIR } };
  if (!r.artifacts?.presentation) return result;
  return {
    ...result,
    artifacts: { ...r.artifacts, presentation },
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function presign(client: S3Client, bucket: string, key: string): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
  });
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

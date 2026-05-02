import { access, mkdir, readFile } from 'node:fs/promises';
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
      visionReviewS3Uri?: string;
      v1DeckS3Uri?: string;
      v1IrS3Uri?: string;
      designReviewS3Uri?: string;
      stabilizationDiagnosticsS3Uri?: string;
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
  /**
   * Optional vision-reviewer report. When provided, the report is uploaded
   * to `<runPrefix>vision-review.json`.
   */
  visionReview?: unknown;
  /**
   * Optional design-review loop trace (iterations summary). Persisted to
   * `<runPrefix>design-review.json` so before/after diffs are reproducible.
   * `slideImages` bytes are stripped before serialization.
   */
  designReviewTrace?: unknown;
  /**
   * Optional stabilization diagnostics. Persisted to
   * `<runPrefix>stabilization-diagnostics.json`.
   */
  stabilizationDiagnostics?: unknown;
  /**
   * Optional pre-revision artifact archive. When the vision-revision loop
   * runs, the v1 (pre-revision) deck and IR are uploaded under `<runPrefix>v1/`
   * so the before/after pair is reproducible.
   */
  v1Archive?: {
    presentation?: PresentationIR;
    pptxLocalPath?: string;
  };
};

/**
 * Materialize `generated://` virtual asset uris into real on-disk files and
 * export the presentation to `outputPath` as pptx. Returns the materialized
 * presentation (with file:// asset uris) and the local path.
 *
 * Exported separately from `publishArtifactIfNeeded` so the index flow can
 * render pptx for vision review BEFORE revision, then publish the (possibly
 * revised) version afterwards.
 */
export async function materializeAndExportPptx(input: {
  presentation: PresentationIR;
  outputPath: string;
}): Promise<{ presentation: PresentationIR; outputPath: string; exists: boolean }> {
  const outputDir = dirname(input.outputPath);
  await mkdir(outputDir, { recursive: true });

  let materialized: PresentationIR = input.presentation;
  try {
    materialized = await materializeGeneratedAssets(input.presentation, {
      outputDir,
      generators: buildImageGenerators(),
      fallbackPolicy: 'local-file',
      safety: { allowOutsideWorkspace: true },
    });
  } catch (error) {
    getLogger().warn(
      { error: String(error) },
      '[deck-forge-runtime] [artifact] materializeGeneratedAssets failed in materializeAndExportPptx; continuing with virtual uris',
    );
  }

  const runtime = getOrCreateRuntime();
  await runtime.export(materialized, {
    format: 'pptx',
    outputPath: input.outputPath,
  });

  const exists = await pathExists(input.outputPath);
  return { presentation: materialized, outputPath: input.outputPath, exists };
}

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

  // 6) Upload vision-review.json (optional)
  let visionReviewS3Uri: string | undefined;
  if (input.visionReview !== undefined) {
    const reviewKey = `${runPrefix}vision-review.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: reviewKey,
        Body: JSON.stringify(input.visionReview, null, 2),
        ContentType: 'application/json',
      }),
    );
    visionReviewS3Uri = `s3://${bucket}/${reviewKey}`;
  }

  // 6b) Upload design-review.json (optional)
  let designReviewS3Uri: string | undefined;
  if (input.designReviewTrace !== undefined) {
    const traceKey = `${runPrefix}design-review.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: traceKey,
        Body: JSON.stringify(input.designReviewTrace, null, 2),
        ContentType: 'application/json',
      }),
    );
    designReviewS3Uri = `s3://${bucket}/${traceKey}`;
  }

  // 6c) Upload stabilization-diagnostics.json (optional)
  let stabilizationDiagnosticsS3Uri: string | undefined;
  if (input.stabilizationDiagnostics !== undefined) {
    const stabKey = `${runPrefix}stabilization-diagnostics.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: stabKey,
        Body: JSON.stringify(input.stabilizationDiagnostics, null, 2),
        ContentType: 'application/json',
      }),
    );
    stabilizationDiagnosticsS3Uri = `s3://${bucket}/${stabKey}`;
  }

  // 7) Upload v1 archive (pre-revision deck + IR), optional
  let v1DeckS3Uri: string | undefined;
  let v1IrS3Uri: string | undefined;
  if (input.v1Archive) {
    if (input.v1Archive.pptxLocalPath) {
      const v1Exists = await pathExists(input.v1Archive.pptxLocalPath);
      if (v1Exists) {
        const v1Key = `${runPrefix}v1/deck.pptx`;
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: v1Key,
            Body: await readFile(input.v1Archive.pptxLocalPath),
            ContentType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        );
        v1DeckS3Uri = `s3://${bucket}/${v1Key}`;
      }
    }
    if (input.v1Archive.presentation) {
      const v1IrKey = `${runPrefix}v1/presentation.ir.json`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: v1IrKey,
          Body: JSON.stringify(input.v1Archive.presentation, null, 2),
          ContentType: 'application/json',
        }),
      );
      v1IrS3Uri = `s3://${bucket}/${v1IrKey}`;
    }
  }

  return {
    ...deckArtifact,
    bundleS3Uri,
    bundlePresignedUrl,
    ...(irS3Uri !== undefined ? { irS3Uri } : {}),
    requestS3Uri,
    assetCount,
    ...(visionReviewS3Uri !== undefined ? { visionReviewS3Uri } : {}),
    ...(designReviewS3Uri !== undefined ? { designReviewS3Uri } : {}),
    ...(stabilizationDiagnosticsS3Uri !== undefined ? { stabilizationDiagnosticsS3Uri } : {}),
    ...(v1DeckS3Uri !== undefined ? { v1DeckS3Uri } : {}),
    ...(v1IrS3Uri !== undefined ? { v1IrS3Uri } : {}),
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

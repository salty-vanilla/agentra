import { access, readFile } from 'node:fs/promises';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresentationIR } from '@deck-forge/core';
import { getOrCreateRuntime } from './create-runner.js';

export type DeckForgeArtifact =
  | {
      localPath: string;
      exists: boolean;
      s3Uri?: string;
      presignedUrl?: string;
      expiresIn?: number;
    }
  | undefined;

const PRESIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

export async function publishArtifactIfNeeded(input: {
  presentation: PresentationIR | undefined;
  outputPath: string | undefined;
  runId: string;
  format: 'pptx' | 'html' | 'json' | 'pdf';
}): Promise<DeckForgeArtifact> {
  if (!input.outputPath || input.format !== 'pptx' || input.presentation === undefined) {
    return undefined;
  }

  const runtime = getOrCreateRuntime();
  await runtime.export(input.presentation, {
    format: input.format,
    outputPath: input.outputPath,
  });

  const exists = await pathExists(input.outputPath);
  const artifact: NonNullable<DeckForgeArtifact> = {
    localPath: input.outputPath,
    exists,
  };

  if (!exists) {
    return artifact;
  }

  const published = await publishToS3IfConfigured({
    localPath: input.outputPath,
    runId: input.runId,
    format: input.format,
  });

  return {
    ...artifact,
    ...published,
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

async function publishToS3IfConfigured(input: {
  localPath: string;
  runId: string;
  format: 'pptx' | 'html' | 'json' | 'pdf';
}): Promise<
  Pick<NonNullable<DeckForgeArtifact>, 's3Uri' | 'presignedUrl' | 'expiresIn'>
> {
  const bucket = process.env.DECK_FORGE_ARTIFACT_BUCKET?.trim();
  if (!bucket) {
    return {};
  }

  const prefix = normalizePrefix(process.env.DECK_FORGE_ARTIFACT_PREFIX ?? 'deck-forge/');
  const key = `${prefix}${input.runId}/deck.${input.format}`;
  const region = process.env.AWS_REGION?.trim() || process.env.BEDROCK_REGION?.trim();
  const client = new S3Client(region ? { region } : {});
  const body = await readFile(input.localPath);
  const contentType =
    input.format === 'pptx'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/octet-stream';

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const presignedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS },
  );

  return {
    s3Uri: `s3://${bucket}/${key}`,
    presignedUrl,
    expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
  };
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

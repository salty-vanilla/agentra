import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { CreatePresentationToolOutput } from '@agentra/presentation-author';
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client as S3ClientType,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../logger.js';
import type {
  ArtifactUploadResult,
  UploadedPresentationArtifact,
} from './artifact-upload-types.js';

/** Artifact kinds eligible for upload. */
const UPLOADABLE_KINDS = new Set([
  'pptx',
  'source-js',
  'contact-sheet',
  'rendered-slide',
  'diagnostics-json',
]);

export interface UploadPresentationArtifactsInput {
  result: CreatePresentationToolOutput;
  bucketName: string;
  prefix?: string | undefined;
  runId: string;
  includePresignedUrls?: boolean | undefined;
  presignedUrlExpiresSeconds?: number | undefined;
}

export interface UploadPresentationArtifactsDeps {
  s3Client: S3ClientType;
}

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function buildS3Key(
  prefix: string,
  runId: string,
  artifact: { kind: string; path: string },
): string {
  const filename = basename(artifact.path);
  if (artifact.kind === 'rendered-slide') {
    return `${prefix}/${runId}/rendered/${filename}`;
  }
  return `${prefix}/${runId}/${filename}`;
}

export async function uploadPresentationArtifacts(
  input: UploadPresentationArtifactsInput,
  deps: UploadPresentationArtifactsDeps,
): Promise<ArtifactUploadResult> {
  const {
    result,
    bucketName,
    runId,
    prefix = 'runs',
    includePresignedUrls = true,
    presignedUrlExpiresSeconds = 3600,
  } = input;
  const { s3Client } = deps;

  const uploadedArtifacts: UploadedPresentationArtifact[] = [];
  const warnings: string[] = [];

  if (!result.success) {
    warnings.push(
      'Presentation generation was not successful; skipping artifact upload.',
    );
    return { uploadedArtifacts, warnings };
  }

  const eligible = result.artifacts.filter(
    (a) => UPLOADABLE_KINDS.has(a.kind) && a.exists && a.path,
  );

  logger.info({
    component: 's3-artifact-uploader',
    runId,
    step: 'upload_start',
    bucket: bucketName,
    prefix,
    eligibleCount: eligible.length,
  });

  for (const artifact of eligible) {
    const key = buildS3Key(prefix, runId, artifact);
    const contentType = detectContentType(artifact.path);
    let sizeBytes: number | undefined;
    let uploaded = false;
    let downloadUrl: string | undefined;

    try {
      const fileStat = await stat(artifact.path);
      sizeBytes = fileStat.size;

      const fileContent = await readFile(artifact.path);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileContent,
          ContentType: contentType,
          Metadata: {
            runId,
            artifactKind: artifact.kind,
          },
        }),
      );

      uploaded = true;

      if (includePresignedUrls) {
        try {
          downloadUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucketName, Key: key }),
            { expiresIn: presignedUrlExpiresSeconds },
          );
        } catch (presignErr) {
          const msg =
            presignErr instanceof Error ? presignErr.message : String(presignErr);
          warnings.push(`Failed to generate presigned URL for ${key}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const warning = `Failed to upload ${artifact.kind} (${artifact.path}): ${msg}`;
      warnings.push(warning);

      if (artifact.kind === 'pptx') {
        warnings.push('CRITICAL: PPTX artifact upload failed.');
      }
    }

    uploadedArtifacts.push({
      kind: artifact.kind as UploadedPresentationArtifact['kind'],
      label: artifact.label,
      localPath: artifact.path,
      bucket: bucketName,
      key,
      s3Uri: `s3://${bucketName}/${key}`,
      downloadUrl,
      uploaded,
      contentType,
      sizeBytes,
    });
  }

  logger.info({
    component: 's3-artifact-uploader',
    runId,
    step: 'upload_done',
    uploadedCount: uploadedArtifacts.filter((a) => a.uploaded).length,
    totalCount: uploadedArtifacts.length,
    kinds: uploadedArtifacts.filter((a) => a.uploaded).map((a) => a.kind),
    hasPresignedUrls: uploadedArtifacts.some((a) => a.downloadUrl),
    warningCount: warnings.length,
  });

  return { uploadedArtifacts, warnings };
}

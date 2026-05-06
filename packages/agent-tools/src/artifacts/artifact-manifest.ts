import { compactRecord, createStableId, normalizeText } from '../internal.js';
import type { ArtifactManifest, ArtifactRef } from './artifact-types.js';

function normalizeCreatedAt(createdAt?: string): string {
  return normalizeText(createdAt) ?? new Date().toISOString();
}

export function createArtifactManifest(input: {
  artifacts: Array<
    Omit<ArtifactRef, 'id' | 'createdAt'> & Partial<Pick<ArtifactRef, 'id' | 'createdAt'>>
  >;
  metadata?: Record<string, unknown>;
  idHint?: string;
  createdAt?: string;
}): ArtifactManifest {
  const createdAt = normalizeCreatedAt(input.createdAt);
  const metadata = input.metadata ? compactRecord(input.metadata) : undefined;
  const idHint = normalizeText(input.idHint);

  const manifestId =
    idHint ??
    createStableId('artifact-manifest', {
      createdAt,
      metadata,
      artifacts: input.artifacts.map((artifact) => ({
        kind: artifact.kind,
        name: artifact.name,
        path: normalizeText(artifact.path),
        url: normalizeText(artifact.url),
        mimeType: normalizeText(artifact.mimeType),
        sizeBytes:
          typeof artifact.sizeBytes === 'number' && Number.isFinite(artifact.sizeBytes)
            ? artifact.sizeBytes
            : undefined,
        metadata: artifact.metadata ? compactRecord(artifact.metadata) : undefined,
      })),
    });

  const artifacts: ArtifactRef[] = input.artifacts.map((artifact, index) => {
    const artifactCreatedAt = normalizeCreatedAt(artifact.createdAt);
    const artifactMetadata = artifact.metadata
      ? compactRecord(artifact.metadata)
      : undefined;
    const normalized: ArtifactRef = {
      id:
        normalizeText(artifact.id) ??
        createStableId('artifact', {
          manifestId,
          index,
          kind: artifact.kind,
          name: normalizeText(artifact.name),
          path: normalizeText(artifact.path),
          url: normalizeText(artifact.url),
          mimeType: normalizeText(artifact.mimeType),
          sizeBytes:
            typeof artifact.sizeBytes === 'number' && Number.isFinite(artifact.sizeBytes)
              ? artifact.sizeBytes
              : undefined,
          createdAt: artifactCreatedAt,
          metadata: artifactMetadata,
        }),
      kind: artifact.kind,
      name: normalizeText(artifact.name) ?? artifact.name,
      createdAt: artifactCreatedAt,
    };

    const path = normalizeText(artifact.path);
    const url = normalizeText(artifact.url);
    const mimeType = normalizeText(artifact.mimeType);
    if (path) normalized.path = path;
    if (url) normalized.url = url;
    if (mimeType) normalized.mimeType = mimeType;
    if (typeof artifact.sizeBytes === 'number' && Number.isFinite(artifact.sizeBytes)) {
      normalized.sizeBytes = artifact.sizeBytes;
    }
    if (artifactMetadata && Object.keys(artifactMetadata).length > 0) {
      normalized.metadata = artifactMetadata;
    }
    return normalized;
  });

  return {
    id: manifestId,
    createdAt,
    artifacts,
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

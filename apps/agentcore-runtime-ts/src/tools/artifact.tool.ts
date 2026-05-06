import { type ArtifactKind, createArtifactManifest } from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_ARTIFACTS = 50;
const MAX_ARTIFACT_NAME_LENGTH = 200;
const MAX_ARTIFACT_PATH_LENGTH = 2048;
const MAX_ARTIFACT_URL_LENGTH = 4096;

const artifactKindSchema = z.enum([
  'pptx',
  'pdf',
  'html',
  'png',
  'json',
  'text',
  'other',
]);

const artifactInputSchema = z.object({
  id: z.string().optional(),
  kind: artifactKindSchema,
  name: z.string(),
  path: z.string().optional(),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createArtifactManifestInputSchema = z.object({
  artifacts: z.array(artifactInputSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idHint: z.string().optional(),
  createdAt: z.string().optional(),
});

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

type ArtifactToolInput = {
  id?: string | undefined;
  kind: ArtifactKind;
  name: string;
  path?: string | undefined;
  url?: string | undefined;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
  createdAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type CreateArtifactManifestToolInput = {
  artifacts: ArtifactToolInput[];
  metadata?: Record<string, unknown> | undefined;
  idHint?: string | undefined;
  createdAt?: string | undefined;
};

function validateCreateArtifactManifestInput(
  input: CreateArtifactManifestToolInput,
): void {
  if (input.artifacts.length < 1 || input.artifacts.length > MAX_ARTIFACTS) {
    throw new Error(`artifacts must contain 1 to ${MAX_ARTIFACTS} items`);
  }

  input.artifacts.forEach((artifact, index) => {
    if (artifact.name.trim().length === 0) {
      throw new Error(`artifacts[${index}].name must not be empty`);
    }

    if (artifact.name.length > MAX_ARTIFACT_NAME_LENGTH) {
      throw new Error(
        `artifacts[${index}].name must not exceed ${MAX_ARTIFACT_NAME_LENGTH} characters`,
      );
    }

    if (artifact.path !== undefined && artifact.path.length > MAX_ARTIFACT_PATH_LENGTH) {
      throw new Error(
        `artifacts[${index}].path must not exceed ${MAX_ARTIFACT_PATH_LENGTH} characters`,
      );
    }

    if (artifact.url !== undefined && artifact.url.length > MAX_ARTIFACT_URL_LENGTH) {
      throw new Error(
        `artifacts[${index}].url must not exceed ${MAX_ARTIFACT_URL_LENGTH} characters`,
      );
    }

    if (
      artifact.sizeBytes !== undefined &&
      (!Number.isFinite(artifact.sizeBytes) || artifact.sizeBytes < 0)
    ) {
      throw new Error(
        `artifacts[${index}].sizeBytes must be a finite non-negative number`,
      );
    }
  });
}

export function executeCreateArtifactManifestTool(
  input: CreateArtifactManifestToolInput,
) {
  try {
    validateCreateArtifactManifestInput(input);

    const manifest = createArtifactManifest({
      artifacts: input.artifacts.map((artifact) => ({
        ...definedProperty('id', artifact.id),
        kind: artifact.kind,
        name: artifact.name,
        ...definedProperty('path', artifact.path),
        ...definedProperty('url', artifact.url),
        ...definedProperty('mimeType', artifact.mimeType),
        ...definedProperty('sizeBytes', artifact.sizeBytes),
        ...definedProperty('createdAt', artifact.createdAt),
        ...definedProperty('metadata', artifact.metadata),
      })),
      ...definedProperty('metadata', input.metadata),
      ...definedProperty('idHint', input.idHint),
      ...definedProperty('createdAt', input.createdAt),
    });

    return toolSuccess(manifest);
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const createArtifactManifestTool = tool({
  name: 'create_artifact_manifest',
  description:
    'Create a normalized manifest for generated artifacts such as PPTX, PDF, HTML, PNG, JSON, or text outputs. This only normalizes metadata and does not upload, read, write, or verify files.',
  inputSchema: createArtifactManifestInputSchema,
  callback: executeCreateArtifactManifestTool,
});

export { createArtifactManifestTool };

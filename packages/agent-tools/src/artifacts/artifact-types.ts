export type ArtifactKind = 'pptx' | 'pdf' | 'html' | 'png' | 'json' | 'text' | 'other';

export type ArtifactRef = {
  id: string;
  kind: ArtifactKind;
  name: string;
  path?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ArtifactManifest = {
  id: string;
  createdAt: string;
  artifacts: ArtifactRef[];
  metadata?: Record<string, unknown>;
};

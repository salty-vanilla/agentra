import { describe, expect, it } from 'vitest';
import {
  artifactKindSchema,
  artifactManifestSchema,
  artifactRefSchema,
  artifactUploadResultSchema,
  uploadedArtifactSchema,
} from './artifacts.js';

describe('Artifact types', () => {
  describe('artifactKindSchema', () => {
    it('accepts all presentation artifact kinds', () => {
      const kinds = [
        'pptx',
        'source-js',
        'contact-sheet',
        'rendered-slide',
        'diagnostics-json',
        'image-asset',
      ];
      kinds.forEach((kind) => {
        expect(() => artifactKindSchema.parse(kind)).not.toThrow();
      });
    });

    it('accepts all generic artifact kinds', () => {
      const kinds = ['pdf', 'html', 'png', 'jpg', 'json', 'text', 'other'];
      kinds.forEach((kind) => {
        expect(() => artifactKindSchema.parse(kind)).not.toThrow();
      });
    });

    it('rejects unknown kinds', () => {
      expect(() => artifactKindSchema.parse('unknown-kind')).toThrow();
    });
  });

  describe('artifactRefSchema', () => {
    it('validates a minimal artifact ref', () => {
      const artifact = {
        id: 'artifact-1',
        kind: 'pptx',
        name: 'presentation.pptx',
        createdAt: '2025-05-15T10:00:00Z',
      };
      expect(() => artifactRefSchema.parse(artifact)).not.toThrow();
    });

    it('validates a complete artifact ref', () => {
      const artifact = {
        id: 'artifact-1',
        kind: 'pptx',
        name: 'presentation.pptx',
        path: '/tmp/presentation.pptx',
        url: 'https://example.com/presentation.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: 1024000,
        createdAt: '2025-05-15T10:00:00Z',
        label: 'Main Presentation',
        exists: true,
        metadata: { version: 1, author: 'test' },
      };
      expect(() => artifactRefSchema.parse(artifact)).not.toThrow();
    });

    it('rejects artifact without required fields', () => {
      const artifact = {
        id: 'artifact-1',
        kind: 'pptx',
        name: 'presentation.pptx',
      };
      expect(() => artifactRefSchema.parse(artifact)).toThrow();
    });
  });

  describe('uploadedArtifactSchema', () => {
    it('validates an uploaded artifact', () => {
      const uploaded = {
        kind: 'pptx',
        label: 'Presentation',
        localPath: '/tmp/presentation.pptx',
        bucket: 'my-bucket',
        key: 'runs/run-123/presentation.pptx',
        s3Uri: 's3://my-bucket/runs/run-123/presentation.pptx',
        uploaded: true,
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: 1024000,
      };
      expect(() => uploadedArtifactSchema.parse(uploaded)).not.toThrow();
    });

    it('accepts presentation artifact kinds', () => {
      const kinds = ['pptx', 'source-js', 'contact-sheet', 'rendered-slide'];
      kinds.forEach((kind) => {
        const uploaded = {
          kind,
          label: 'Test',
          localPath: '/tmp/test',
          bucket: 'bucket',
          key: 'key',
          s3Uri: 's3://bucket/key',
          uploaded: true,
        };
        expect(() => uploadedArtifactSchema.parse(uploaded)).not.toThrow();
      });
    });
  });

  describe('artifactManifestSchema', () => {
    it('validates a manifest with multiple artifacts', () => {
      const manifest = {
        id: 'manifest-1',
        createdAt: '2025-05-15T10:00:00Z',
        artifacts: [
          {
            id: 'artifact-1',
            kind: 'pptx',
            name: 'presentation.pptx',
            createdAt: '2025-05-15T10:00:00Z',
          },
          {
            id: 'artifact-2',
            kind: 'diagnostics-json',
            name: 'diagnostics.json',
            createdAt: '2025-05-15T10:00:00Z',
          },
        ],
      };
      expect(() => artifactManifestSchema.parse(manifest)).not.toThrow();
    });
  });

  describe('artifactUploadResultSchema', () => {
    it('validates an upload result', () => {
      const result = {
        uploadedArtifacts: [
          {
            kind: 'pptx',
            label: 'Presentation',
            localPath: '/tmp/presentation.pptx',
            bucket: 'my-bucket',
            key: 'runs/run-123/presentation.pptx',
            s3Uri: 's3://my-bucket/runs/run-123/presentation.pptx',
            uploaded: true,
          },
        ],
        warnings: [],
      };
      expect(() => artifactUploadResultSchema.parse(result)).not.toThrow();
    });

    it('allows warnings in upload result', () => {
      const result = {
        uploadedArtifacts: [],
        warnings: ['Failed to upload image-asset', 'Presigned URL generation failed'],
      };
      expect(() => artifactUploadResultSchema.parse(result)).not.toThrow();
    });
  });

  describe('Artifact kind compatibility', () => {
    it('supports all presentation kinds as uploaded artifacts', () => {
      const presentationKinds = [
        'pptx',
        'source-js',
        'contact-sheet',
        'rendered-slide',
        'diagnostics-json',
        'image-asset',
      ];

      presentationKinds.forEach((kind) => {
        const uploaded = {
          kind,
          label: 'Test',
          localPath: '/tmp/test',
          bucket: 'bucket',
          key: 'key',
          s3Uri: 's3://bucket/key',
          uploaded: true,
        };
        expect(() => uploadedArtifactSchema.parse(uploaded)).not.toThrow();
      });
    });

    it('supports render-dir and work-dir as artifact refs', () => {
      const renderDirRef = {
        id: 'test',
        kind: 'render-dir' as const,
        name: 'test',
        createdAt: '2025-05-15T10:00:00Z',
      };
      expect(() => artifactRefSchema.parse(renderDirRef)).not.toThrow();

      const workDirRef = {
        id: 'test',
        kind: 'work-dir' as const,
        name: 'test',
        createdAt: '2025-05-15T10:00:00Z',
      };
      expect(() => artifactRefSchema.parse(workDirRef)).not.toThrow();
    });
  });
});

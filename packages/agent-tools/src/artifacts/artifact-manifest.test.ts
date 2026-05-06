import { describe, expect, it } from 'vitest';
import { createArtifactManifest } from './artifact-manifest.js';

describe('createArtifactManifest', () => {
  it('fills manifest id, createdAt, and artifact ids while preserving order', () => {
    const manifest = createArtifactManifest({
      createdAt: '2024-01-01T00:00:00.000Z',
      metadata: { stage: 't-1a' },
      artifacts: [
        { kind: 'pptx', name: 'Deck', path: 'deck.pptx' },
        {
          id: 'existing-id',
          kind: 'pdf',
          name: 'Report',
          url: 'https://example.com/report.pdf',
          createdAt: '2024-01-02T00:00:00.000Z',
        },
      ],
    });

    expect(manifest.id).toContain('artifact-manifest-');
    expect(manifest.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(manifest.metadata).toEqual({ stage: 't-1a' });
    expect(manifest.artifacts).toHaveLength(2);
    expect(manifest.artifacts[0]?.id).toContain('artifact-');
    expect(manifest.artifacts[0]).toMatchObject({
      kind: 'pptx',
      name: 'Deck',
      path: 'deck.pptx',
    });
    expect(manifest.artifacts[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.artifacts[1]).toMatchObject({
      id: 'existing-id',
      kind: 'pdf',
      name: 'Report',
      url: 'https://example.com/report.pdf',
      createdAt: '2024-01-02T00:00:00.000Z',
    });
  });
});

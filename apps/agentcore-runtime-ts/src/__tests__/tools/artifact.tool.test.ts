import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('artifact tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a normalized manifest for a pptx artifact', async () => {
    const { executeCreateArtifactManifestTool } = await import(
      '../../tools/artifact.tool.js'
    );

    const response = executeCreateArtifactManifestTool({
      createdAt: '2024-01-01T00:00:00.000Z',
      metadata: { stage: 'draft' },
      idHint: 'manifest-hint',
      artifacts: [
        {
          kind: 'pptx',
          name: '  Quarterly Deck  ',
          path: 'outputs/quarterly-deck.pptx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          sizeBytes: 1024,
          metadata: { audience: 'board' },
        },
      ],
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.id).toContain('manifest-hint');
    expect(payload.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(payload.metadata).toEqual({ stage: 'draft' });
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]?.id).toContain('artifact-');
    expect(payload.artifacts[0]).toMatchObject({
      kind: 'pptx',
      name: 'Quarterly Deck',
      path: 'outputs/quarterly-deck.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: 1024,
      metadata: { audience: 'board' },
    });
  });

  it('rejects empty artifact lists', async () => {
    const { executeCreateArtifactManifestTool } = await import(
      '../../tools/artifact.tool.js'
    );

    const response = executeCreateArtifactManifestTool({
      artifacts: [],
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('artifacts must contain 1 to 50 items');
  });

  it('rejects oversized and invalid artifact input without throwing', async () => {
    const { executeCreateArtifactManifestTool } = await import(
      '../../tools/artifact.tool.js'
    );

    const tooManyArtifacts = Array.from({ length: 51 }, (_, index) => ({
      kind: 'text' as const,
      name: `Artifact ${index}`,
    }));

    expect(() => {
      const response = executeCreateArtifactManifestTool({
        artifacts: tooManyArtifacts,
      });
      expect(response.status).toBe('error');
      expect(response.content[0]?.text).toContain('artifacts must contain 1 to 50 items');
    }).not.toThrow();

    const blankNameResponse = executeCreateArtifactManifestTool({
      artifacts: [
        {
          kind: 'text',
          name: '   ',
        },
      ],
    });

    expect(blankNameResponse.status).toBe('error');
    expect(blankNameResponse.content[0]?.text).toContain('name must not be empty');

    const longPathResponse = executeCreateArtifactManifestTool({
      artifacts: [
        {
          kind: 'text',
          name: 'Valid name',
          path: 'x'.repeat(2049),
        },
      ],
    });

    expect(longPathResponse.status).toBe('error');
    expect(longPathResponse.content[0]?.text).toContain('path must not exceed 2048');

    const longUrlResponse = executeCreateArtifactManifestTool({
      artifacts: [
        {
          kind: 'text',
          name: 'Valid name',
          url: 'x'.repeat(4097),
        },
      ],
    });

    expect(longUrlResponse.status).toBe('error');
    expect(longUrlResponse.content[0]?.text).toContain('url must not exceed 4096');

    const sizeBytesResponse = executeCreateArtifactManifestTool({
      artifacts: [
        {
          kind: 'text',
          name: 'Valid name',
          sizeBytes: -1,
        },
      ],
    });

    expect(sizeBytesResponse.status).toBe('error');
    expect(sizeBytesResponse.content[0]?.text).toContain(
      'sizeBytes must be a finite non-negative number',
    );
  });
});

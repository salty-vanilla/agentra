import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('evidence tools', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('normalizes evidence sources with defaults and trimmed values', async () => {
    const { executeNormalizeEvidenceSourceTool } = await import(
      '../../tools/evidence.tool.js'
    );

    const response = executeNormalizeEvidenceSourceTool({
      title: '  Example Title  ',
      url: 'https://example.com',
      snippet: '  ',
      metadata: {
        keep: 'value',
        empty: '',
      },
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.id).toContain('evidence-');
    expect(payload.type).toBe('unknown');
    expect(payload.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.title).toBe('Example Title');
    expect(payload.url).toBe('https://example.com');
    expect(payload.snippet).toBeUndefined();
    expect(payload.metadata).toEqual({ keep: 'value' });
  });

  it('builds citations and deduplicates source ids', async () => {
    const { executeBuildCitationsTool, executeNormalizeEvidenceSourceTool } =
      await import('../../tools/evidence.tool.js');

    const first = JSON.parse(
      executeNormalizeEvidenceSourceTool({
        idHint: 'alpha',
        type: 'web',
        title: 'Alpha',
      }).content[0]?.text ?? '{}',
    );
    const duplicate = JSON.parse(
      executeNormalizeEvidenceSourceTool({
        idHint: 'alpha',
        type: 'web',
        title: 'Alpha duplicate',
      }).content[0]?.text ?? '{}',
    );
    const second = JSON.parse(
      executeNormalizeEvidenceSourceTool({
        idHint: 'beta',
        type: 'document',
        title: 'Beta',
        url: 'https://example.com/beta',
      }).content[0]?.text ?? '{}',
    );

    const response = executeBuildCitationsTool({
      sources: [first, duplicate, second],
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '[]');
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      id: 'alpha',
      label: '[1]',
      sourceId: 'alpha',
      type: 'web',
      title: 'Alpha',
    });
    expect(payload[1]).toMatchObject({
      id: 'beta',
      label: '[2]',
      sourceId: 'beta',
      type: 'document',
      url: 'https://example.com/beta',
    });
  });

  it('rejects oversized citation input', async () => {
    const { executeBuildCitationsTool } = await import('../../tools/evidence.tool.js');

    const sources = Array.from({ length: 101 }, (_, index) => ({
      id: `source-${index}`,
      type: 'web' as const,
      retrievedAt: '2024-01-01T00:00:00.000Z',
    }));

    const response = executeBuildCitationsTool({
      sources,
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('sources must not exceed 100');
  });
});

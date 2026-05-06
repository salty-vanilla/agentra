import { describe, expect, it } from 'vitest';
import { buildCitations } from './citation-builder.js';
import { normalizeEvidenceSource } from './normalize-source.js';

describe('normalizeEvidenceSource', () => {
  it('fills id, retrievedAt, and type', () => {
    const source = normalizeEvidenceSource({
      title: '  Example Title  ',
    });

    expect(source.id).toContain('evidence-');
    expect(source.type).toBe('unknown');
    expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(source.title).toBe('Example Title');
  });

  it('drops empty strings and keeps url + uri independently', () => {
    const source = normalizeEvidenceSource({
      type: 'web',
      title: ' ',
      url: 'https://example.com',
      uri: 'urn:example:1',
      snippet: '',
      metadata: {
        empty: '',
        nested: { value: 'x' },
      },
      idHint: '  source-a  ',
      retrievedAt: '2024-01-01T00:00:00.000Z',
    });

    expect(source.id).toBe('source-a');
    expect(source.title).toBeUndefined();
    expect(source.snippet).toBeUndefined();
    expect(source.url).toBe('https://example.com');
    expect(source.uri).toBe('urn:example:1');
    expect(source.metadata).toEqual({ nested: { value: 'x' } });
  });
});

describe('buildCitations', () => {
  it('deduplicates by source id and labels citations in order', () => {
    const sources = [
      normalizeEvidenceSource({
        idHint: 'alpha',
        type: 'web',
        title: 'Alpha',
      }),
      normalizeEvidenceSource({
        idHint: 'alpha',
        type: 'web',
        title: 'Alpha duplicate',
      }),
      normalizeEvidenceSource({
        idHint: 'beta',
        type: 'document',
        title: 'Beta',
        url: 'https://example.com/beta',
      }),
    ];

    const citations = buildCitations(sources);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      id: 'alpha',
      label: '[1]',
      sourceId: 'alpha',
      type: 'web',
      title: 'Alpha',
    });
    expect(citations[1]).toMatchObject({
      id: 'beta',
      label: '[2]',
      sourceId: 'beta',
      type: 'document',
      url: 'https://example.com/beta',
    });
  });
});

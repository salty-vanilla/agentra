import type { Citation, EvidenceSource } from './evidence-types.js';

export function buildCitations(sources: EvidenceSource[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    const citation: Citation = {
      id: source.id,
      label: `[${citations.length + 1}]`,
      sourceId: source.id,
      type: source.type,
    };

    if (source.title !== undefined) citation.title = source.title;
    if (source.url !== undefined) citation.url = source.url;
    if (source.uri !== undefined) citation.uri = source.uri;

    citations.push(citation);
  }

  return citations;
}

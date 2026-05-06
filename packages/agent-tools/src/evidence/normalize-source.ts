import { compactRecord, createStableId, normalizeText } from '../internal.js';
import type { EvidenceSource, EvidenceSourceType } from './evidence-types.js';

function normalizeType(type: EvidenceSourceType | undefined): EvidenceSourceType {
  return type ?? 'unknown';
}

function normalizeIsoTimestamp(value: string | undefined): string {
  const normalized = normalizeText(value);
  return normalized ?? new Date().toISOString();
}

export function normalizeEvidenceSource(input: {
  type?: EvidenceSourceType;
  title?: string;
  url?: string;
  uri?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  retrievedAt?: string;
  idHint?: string;
}): EvidenceSource {
  const type = normalizeType(input.type);
  const title = normalizeText(input.title);
  const url = normalizeText(input.url);
  const uri = normalizeText(input.uri);
  const snippet = normalizeText(input.snippet);
  const retrievedAt = normalizeIsoTimestamp(input.retrievedAt);
  const metadata = input.metadata ? compactRecord(input.metadata) : undefined;
  const idHint = normalizeText(input.idHint);

  const id =
    idHint ??
    createStableId('evidence', {
      type,
      title,
      url,
      uri,
      snippet,
      score: input.score,
      metadata,
    });

  const source: EvidenceSource = {
    id,
    type,
    retrievedAt,
  };

  if (title) source.title = title;
  if (url) source.url = url;
  if (uri) source.uri = uri;
  if (snippet) source.snippet = snippet;
  if (typeof input.score === 'number' && Number.isFinite(input.score)) {
    source.score = input.score;
  }
  if (metadata && Object.keys(metadata).length > 0) {
    source.metadata = metadata;
  }

  return source;
}

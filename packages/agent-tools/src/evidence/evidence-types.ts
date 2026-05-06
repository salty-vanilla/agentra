export type EvidenceSourceType =
  | 'web'
  | 'document'
  | 'structured_data'
  | 'tool_result'
  | 'artifact'
  | 'unknown';

export type EvidenceSource = {
  id: string;
  type: EvidenceSourceType;
  title?: string;
  url?: string;
  uri?: string;
  snippet?: string;
  retrievedAt: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type Citation = {
  id: string;
  label: string;
  sourceId: string;
  type: EvidenceSourceType;
  title?: string;
  url?: string;
  uri?: string;
};

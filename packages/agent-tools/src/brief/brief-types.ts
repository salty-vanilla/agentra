export type BriefAudience = 'executive' | 'engineer' | 'sales' | 'general' | 'unknown';

export type BriefOutputFormat = 'chat' | 'presentation' | 'report' | 'json' | 'unknown';

export type Brief = {
  id: string;
  createdAt: string;
  language?: 'ja' | 'en' | 'unknown';
  audience?: BriefAudience;
  outputFormat?: BriefOutputFormat;
  topic?: string;
  goal?: string;
  constraints?: string[];
  keyFacts?: string[];
  openQuestions?: string[];
  sourceIds?: string[];
  metadata?: Record<string, unknown>;
};

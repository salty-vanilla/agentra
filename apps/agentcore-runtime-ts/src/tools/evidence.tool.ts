import {
  buildCitations,
  type EvidenceSourceType,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_EVIDENCE_SOURCES = 100;

const evidenceSourceTypeSchema = z.enum([
  'web',
  'document',
  'structured_data',
  'tool_result',
  'artifact',
  'unknown',
]);

const normalizeEvidenceSourceInputSchema = z.object({
  type: evidenceSourceTypeSchema.optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  uri: z.string().optional(),
  snippet: z.string().optional(),
  score: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  retrievedAt: z.string().optional(),
  idHint: z.string().optional(),
});

const evidenceSourceSchema = z.object({
  id: z.string(),
  type: evidenceSourceTypeSchema,
  title: z.string().optional(),
  url: z.string().optional(),
  uri: z.string().optional(),
  snippet: z.string().optional(),
  retrievedAt: z.string(),
  score: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const buildCitationsInputSchema = z.object({
  sources: z.array(evidenceSourceSchema),
});

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export type NormalizeEvidenceSourceToolInput = {
  type?: EvidenceSourceType | undefined;
  title?: string | undefined;
  url?: string | undefined;
  uri?: string | undefined;
  snippet?: string | undefined;
  score?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  retrievedAt?: string | undefined;
  idHint?: string | undefined;
};

export type BuildCitationsToolInput = {
  sources: Array<{
    id: string;
    type: EvidenceSourceType;
    title?: string | undefined;
    url?: string | undefined;
    uri?: string | undefined;
    snippet?: string | undefined;
    retrievedAt: string;
    score?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
  }>;
};

export function executeNormalizeEvidenceSourceTool(
  input: NormalizeEvidenceSourceToolInput,
) {
  try {
    const source = {
      ...definedProperty('type', input.type),
      ...definedProperty('title', input.title),
      ...definedProperty('url', input.url),
      ...definedProperty('uri', input.uri),
      ...definedProperty('snippet', input.snippet),
      ...definedProperty('score', input.score),
      ...definedProperty('metadata', input.metadata),
      ...definedProperty('retrievedAt', input.retrievedAt),
      ...definedProperty('idHint', input.idHint),
    } satisfies Parameters<typeof normalizeEvidenceSource>[0];

    return toolSuccess(normalizeEvidenceSource(source));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

export function executeBuildCitationsTool(input: BuildCitationsToolInput) {
  try {
    if (input.sources.length > MAX_EVIDENCE_SOURCES) {
      throw new Error(`sources must not exceed ${MAX_EVIDENCE_SOURCES}`);
    }

    const sources = input.sources.map((source) => ({
      id: source.id,
      type: source.type,
      retrievedAt: source.retrievedAt,
      ...definedProperty('title', source.title),
      ...definedProperty('url', source.url),
      ...definedProperty('uri', source.uri),
      ...definedProperty('snippet', source.snippet),
      ...definedProperty('score', source.score),
      ...definedProperty('metadata', source.metadata),
    })) satisfies Parameters<typeof buildCitations>[0];

    return toolSuccess(buildCitations(sources));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const normalizeEvidenceSourceTool = tool({
  name: 'normalize_evidence_source',
  description:
    'Normalize a raw source from web search, document retrieval, structured data, tool output, or artifact metadata into a common EvidenceSource shape.',
  inputSchema: normalizeEvidenceSourceInputSchema,
  callback: executeNormalizeEvidenceSourceTool,
});

const buildCitationsTool = tool({
  name: 'build_citations',
  description:
    'Build stable citation labels from normalized EvidenceSource objects. Use this when producing grounded answers, reports, slide briefs, or RAG outputs.',
  inputSchema: buildCitationsInputSchema,
  callback: executeBuildCitationsTool,
});

export { buildCitationsTool, normalizeEvidenceSourceTool };

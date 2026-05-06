import {
  type Brief,
  buildCitations,
  type Citation,
  createBrief,
  type EvidenceSource,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const DEFAULT_TOP_K = 5;
const MAX_QUERY_LENGTH = 2000;
const MAX_TEXT_LENGTH = 4000;
const MAX_SNIPPET_LENGTH = 3000;
const MAX_KEY_FACT_LENGTH = 300;
const MAX_KEY_FACTS = 5;

const kbRetrieveInputSchema = z.object({
  query: z.string().describe('Natural language query to retrieve relevant KB chunks.'),
  knowledgeBaseId: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
  createBrief: z.boolean().optional(),
  briefTopic: z.string().optional(),
  briefGoal: z.string().optional(),
  language: z.enum(['ja', 'en', 'unknown']).optional(),
});

export type KbRetrieveToolInput = z.infer<typeof kbRetrieveInputSchema>;

export type ResolvedKbRetrieveInput = {
  query: string;
  knowledgeBaseId: string;
  topK: number;
  createBrief: boolean;
  briefTopic?: string | undefined;
  briefGoal?: string | undefined;
  language: 'ja' | 'en' | 'unknown';
};

export type KbRetrieveToolOutput = {
  query: string;
  knowledgeBaseId: string;
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief;
  rawResultSummary: {
    resultCount: number;
  };
};

type ParsedKbResult = {
  text?: string;
  uri?: string;
  title?: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function trimToLength(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = trimText(value);
  return trimmed ? truncateText(trimmed, maxLength) : undefined;
}

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function validateOptionalText(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
): void {
  if (value !== undefined && value.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
}

function parseDefaultTopK(): number {
  const parsed = Number.parseInt(process.env.BEDROCK_KB_DEFAULT_TOP_K ?? '', 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 20) {
    return parsed;
  }

  return DEFAULT_TOP_K;
}

export function resolveKbRegion(): string {
  return (
    process.env.BEDROCK_KB_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    'us-east-1'
  );
}

export function createBedrockAgentRuntimeClient(region = resolveKbRegion()) {
  return new BedrockAgentRuntimeClient({ region });
}

export function resolveKbRetrieveInput(
  input: KbRetrieveToolInput,
): ResolvedKbRetrieveInput {
  const query = input.query.trim();
  if (!query) {
    throw new Error('query must not be empty');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query must not exceed ${MAX_QUERY_LENGTH} characters`);
  }

  validateOptionalText(input.briefTopic, 'briefTopic', MAX_TEXT_LENGTH);
  validateOptionalText(input.briefGoal, 'briefGoal', MAX_TEXT_LENGTH);

  const knowledgeBaseId =
    trimText(input.knowledgeBaseId) ?? trimText(process.env.BEDROCK_KB_ID);
  if (!knowledgeBaseId) {
    throw new Error('knowledgeBaseId must be provided or BEDROCK_KB_ID must be set');
  }

  return {
    query,
    knowledgeBaseId,
    topK: input.topK ?? parseDefaultTopK(),
    createBrief: input.createBrief ?? true,
    language: input.language ?? 'unknown',
    ...definedProperty('briefTopic', trimText(input.briefTopic)),
    ...definedProperty('briefGoal', trimText(input.briefGoal)),
  };
}

async function retrieveKnowledgeBase(input: {
  query: string;
  knowledgeBaseId: string;
  topK: number;
}): Promise<unknown> {
  const client = createBedrockAgentRuntimeClient();

  const command = new RetrieveCommand({
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalQuery: {
      text: input.query,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: input.topK,
      },
    },
  });

  return client.send(command);
}

function pickLocationUri(location: unknown): string | undefined {
  if (!isRecord(location)) {
    return undefined;
  }

  const locationKeys = [
    ['s3Location', 'uri'],
    ['webLocation', 'url'],
    ['confluenceLocation', 'url'],
    ['sharePointLocation', 'url'],
  ] as const;

  for (const [containerKey, valueKey] of locationKeys) {
    const container = location[containerKey];
    if (!isRecord(container)) {
      continue;
    }

    const value = trimText(asString(container[valueKey]));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function pickMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = trimText(asString(metadata[key]));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseKbRetrieveResults(response: unknown): ParsedKbResult[] {
  if (!isRecord(response)) {
    return [];
  }

  const rawResults = Array.isArray(response.retrievalResults)
    ? response.retrievalResults
    : [];
  const results: ParsedKbResult[] = [];

  for (const entry of rawResults) {
    if (!isRecord(entry)) {
      continue;
    }

    const content = isRecord(entry.content) ? entry.content : undefined;
    const text = trimToLength(asString(content?.text), MAX_SNIPPET_LENGTH);
    const metadata = isRecord(entry.metadata) ? entry.metadata : undefined;
    const uri =
      pickLocationUri(entry.location) ??
      pickMetadataString(metadata, ['source', 'uri', 'url']);
    const title =
      pickMetadataString(metadata, ['title', 'filename', 'fileName', 'source']) ?? uri;
    const score = asNumber(entry.score);

    if (!text && !uri && !title && score === undefined && metadata === undefined) {
      continue;
    }

    results.push({
      ...definedProperty('text', text),
      ...definedProperty('uri', uri),
      ...definedProperty('title', title),
      ...definedProperty('score', score),
      ...definedProperty('metadata', metadata),
    });
  }

  return results;
}

function buildKeyFacts(sources: EvidenceSource[]): string[] | undefined {
  const keyFacts: string[] = [];

  for (const source of sources) {
    if (keyFacts.length >= MAX_KEY_FACTS) {
      break;
    }

    const keyFact = trimToLength(source.snippet, MAX_KEY_FACT_LENGTH);
    if (keyFact && !keyFacts.includes(keyFact)) {
      keyFacts.push(keyFact);
    }
  }

  return keyFacts.length > 0 ? keyFacts : undefined;
}

export function buildKbRetrieveOutput(
  input: ResolvedKbRetrieveInput,
  response: unknown,
): KbRetrieveToolOutput {
  const retrievedAt = new Date().toISOString();
  const parsedResults = parseKbRetrieveResults(response);
  const sources = parsedResults.map((result) =>
    normalizeEvidenceSource({
      type: 'document',
      retrievedAt,
      metadata: {
        provider: 'bedrock-kb',
        knowledgeBaseId: input.knowledgeBaseId,
        ...result.metadata,
      },
      ...definedProperty('title', result.title),
      ...definedProperty('uri', result.uri),
      ...definedProperty('snippet', result.text),
      ...definedProperty('score', result.score),
    }),
  );
  const citations = buildCitations(sources);
  const brief = input.createBrief
    ? createBrief({
        language: input.language,
        outputFormat: 'report',
        topic: input.briefTopic ?? input.query,
        goal:
          input.briefGoal ??
          'Summarize retrieved knowledge base evidence with citations.',
        sourceIds: sources.map((source) => source.id),
        metadata: {
          provider: 'bedrock-kb',
          knowledgeBaseId: input.knowledgeBaseId,
          query: input.query,
        },
        ...definedProperty('keyFacts', buildKeyFacts(sources)),
      })
    : undefined;

  return {
    query: input.query,
    knowledgeBaseId: input.knowledgeBaseId,
    sources,
    citations,
    ...definedProperty('brief', brief),
    rawResultSummary: {
      resultCount: sources.length,
    },
  };
}

export async function executeKbRetrieveTool(input: KbRetrieveToolInput) {
  try {
    const resolved = resolveKbRetrieveInput(input);
    const response = await retrieveKnowledgeBase(resolved);
    return toolSuccess(buildKbRetrieveOutput(resolved, response));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const kbRetrieveTool = tool({
  name: 'kb_retrieve',
  description:
    'Retrieve relevant chunks from an Amazon Bedrock Knowledge Base and normalize them into sources, citations, and an optional brief. This uses Retrieve only and does not generate an answer by itself.',
  inputSchema: kbRetrieveInputSchema,
  callback: executeKbRetrieveTool,
});

export { kbRetrieveTool };

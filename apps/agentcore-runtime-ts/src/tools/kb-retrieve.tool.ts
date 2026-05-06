import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import {
  BedrockKbRetrieveProvider,
  buildBedrockKbRetrieveOutput,
  RagService,
  type ResolvedBedrockKbRetrieveInput,
  resolveBedrockKbRetrieveInput,
} from '../rag/index.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const DEFAULT_TOP_K = 5;
const MAX_QUERY_LENGTH = 2000;

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

export type ResolvedKbRetrieveInput = ResolvedBedrockKbRetrieveInput;

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

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

  const knowledgeBaseId =
    trimText(input.knowledgeBaseId) ?? trimText(process.env.BEDROCK_KB_ID);
  if (!knowledgeBaseId) {
    throw new Error('knowledgeBaseId must be provided or BEDROCK_KB_ID must be set');
  }

  return resolveBedrockKbRetrieveInput({
    query,
    knowledgeBaseId,
    topK: input.topK ?? parseDefaultTopK(),
    createBrief: input.createBrief ?? true,
    language: input.language ?? 'unknown',
    ...definedProperty('briefTopic', trimText(input.briefTopic)),
    ...definedProperty('briefGoal', trimText(input.briefGoal)),
  });
}

export function buildKbRetrieveOutput(
  input: ResolvedKbRetrieveInput,
  response: unknown,
): KbRetrieveToolOutput {
  const output = buildBedrockKbRetrieveOutput(input, response);

  return {
    query: output.query,
    knowledgeBaseId: input.knowledgeBaseId,
    sources: output.sources,
    citations: output.citations,
    ...definedProperty('brief', output.brief),
    rawResultSummary: output.rawResultSummary,
  };
}

export async function executeKbRetrieveTool(input: KbRetrieveToolInput) {
  try {
    const resolved = resolveKbRetrieveInput(input);
    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: resolved.knowledgeBaseId,
      region: resolveKbRegion(),
      defaultTopK: parseDefaultTopK(),
    });
    const service = new RagService(provider);
    const output = await service.search(resolved);
    return toolSuccess({
      query: output.query,
      knowledgeBaseId: resolved.knowledgeBaseId,
      sources: output.sources,
      citations: output.citations,
      ...definedProperty('brief', output.brief),
      rawResultSummary: output.rawResultSummary,
    });
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

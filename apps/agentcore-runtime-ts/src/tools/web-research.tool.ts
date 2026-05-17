import {
  type Brief,
  buildCitations,
  type Citation,
  createBrief,
  type EvidenceSource,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { searchTavily } from './tavily.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_RESULTS = 5;
const DEFAULT_MAX_RESULTS = 5;
const MAX_DOMAIN_COUNT = 20;
const MAX_DOMAIN_LENGTH = 253;
const MAX_QUERY_LENGTH = 1000;
const MAX_SNIPPET_LENGTH = 300;
const MAX_KEY_FACT_LENGTH = 280;
const MAX_KEY_FACTS = 5;

const webResearchInputSchema = z.object({
  query: z.string().describe('Research query to search on the public web.'),
  maxResults: z.number().int().min(1).max(MAX_RESULTS).optional(),
  searchDepth: z.enum(['basic', 'advanced']).optional(),
  topic: z.enum(['general', 'news']).optional(),
  timeRange: z.enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y']).optional(),
  days: z.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeRawContent: z.union([z.boolean(), z.enum(['markdown', 'text'])]).optional(),
  includeAnswer: z.union([z.boolean(), z.enum(['basic', 'advanced'])]).optional(),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  country: z.string().optional(),
  createBrief: z.boolean().optional(),
  briefTopic: z.string().optional(),
  briefGoal: z.string().optional(),
  language: z.enum(['ja', 'en', 'unknown']).optional(),
});

type WebResearchToolInput = z.infer<typeof webResearchInputSchema>;

export type WebResearchToolOutput = {
  query: string;
  answer?: string;
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief;
  rawResultSummary: {
    resultCount: number;
    hasAnswer: boolean;
    hasRawContent: boolean;
  };
};

type ParsedWebResult = {
  title?: string;
  url?: string;
  snippet?: string;
  score?: number;
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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function trimToSnippet(value: string | undefined): string | undefined {
  const trimmed = trimText(value);
  if (!trimmed) {
    return undefined;
  }

  return truncateText(trimmed, MAX_SNIPPET_LENGTH);
}

function trimToKeyFact(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return truncateText(trimmed, MAX_KEY_FACT_LENGTH);
}

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function validateDomainList(values: string[] | undefined, fieldName: string): void {
  if (values === undefined) {
    return;
  }

  if (values.length > MAX_DOMAIN_COUNT) {
    throw new Error(`${fieldName} must not exceed ${MAX_DOMAIN_COUNT} items`);
  }

  values.forEach((value, index) => {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${fieldName}[${index}] must not be empty`);
    }

    if (trimmed.length > MAX_DOMAIN_LENGTH) {
      throw new Error(
        `${fieldName}[${index}] must not exceed ${MAX_DOMAIN_LENGTH} characters`,
      );
    }
  });
}

function validateWebResearchInput(input: WebResearchToolInput): void {
  const query = input.query.trim();
  if (!query) {
    throw new Error('query must not be empty');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query must not exceed ${MAX_QUERY_LENGTH} characters`);
  }

  validateDomainList(input.includeDomains, 'includeDomains');
  validateDomainList(input.excludeDomains, 'excludeDomains');
}

function resolveSearchInput(input: WebResearchToolInput) {
  const payload: {
    query: string;
    search_depth: 'basic' | 'advanced';
    topic: 'general' | 'news';
    max_results: number;
    time_range?: 'day' | 'week' | 'month' | 'year' | 'd' | 'w' | 'm' | 'y';
    days?: number;
    start_date?: string;
    end_date?: string;
    include_answer?: boolean | 'basic' | 'advanced';
    include_raw_content?: boolean | 'markdown' | 'text';
    include_domains?: string[];
    exclude_domains?: string[];
    country?: string;
  } = {
    query: input.query.trim(),
    search_depth: input.searchDepth ?? 'basic',
    topic: input.topic ?? 'general',
    max_results: input.maxResults ?? DEFAULT_MAX_RESULTS,
  };

  if (input.timeRange !== undefined) payload.time_range = input.timeRange;
  if (input.days !== undefined) payload.days = input.days;
  if (input.startDate !== undefined) payload.start_date = input.startDate;
  if (input.endDate !== undefined) payload.end_date = input.endDate;
  if (input.includeAnswer !== undefined) payload.include_answer = input.includeAnswer;
  if (input.includeRawContent !== undefined) {
    payload.include_raw_content = input.includeRawContent;
  }
  if (input.includeDomains !== undefined) payload.include_domains = input.includeDomains;
  if (input.excludeDomains !== undefined) payload.exclude_domains = input.excludeDomains;
  if (input.country !== undefined) payload.country = input.country;

  return payload;
}

function pickSnippet(result: Record<string, unknown>): string | undefined {
  const rawContent = trimText(asString(result.raw_content));
  if (rawContent && rawContent.length <= MAX_SNIPPET_LENGTH) {
    return trimToSnippet(rawContent);
  }

  const content = trimToSnippet(asString(result.content));
  if (content) {
    return content;
  }

  return trimToSnippet(asString(result.title));
}

function parseTavilyResults(data: unknown): {
  answer?: string;
  results: ParsedWebResult[];
  hasRawContent: boolean;
} {
  if (!isRecord(data)) {
    return { results: [], hasRawContent: false };
  }

  const rawResults = Array.isArray(data.results) ? data.results : [];
  const results: ParsedWebResult[] = [];
  let hasRawContent = false;

  for (const entry of rawResults) {
    if (!isRecord(entry)) {
      continue;
    }

    const title = trimText(asString(entry.title));
    const url = trimText(asString(entry.url));
    const score = asNumber(entry.score);
    const snippet = pickSnippet(entry);

    if (asString(entry.raw_content)) {
      hasRawContent = true;
    }

    if (!title && !url && !snippet && score === undefined) {
      continue;
    }

    const parsedResult: ParsedWebResult = {};
    if (title !== undefined) parsedResult.title = title;
    if (url !== undefined) parsedResult.url = url;
    if (snippet !== undefined) parsedResult.snippet = snippet;
    if (score !== undefined) parsedResult.score = score;
    results.push(parsedResult);
  }

  const response: {
    answer?: string;
    results: ParsedWebResult[];
    hasRawContent: boolean;
  } = {
    results,
    hasRawContent,
  };
  const answer = trimToSnippet(asString(data.answer));
  if (answer !== undefined) {
    response.answer = answer;
  }

  return response;
}

function buildKeyFacts(
  answer: string | undefined,
  sources: EvidenceSource[],
): string[] | undefined {
  const keyFacts: string[] = [];

  const normalizedAnswer = trimToKeyFact(answer);
  if (normalizedAnswer) {
    keyFacts.push(normalizedAnswer);
  }

  for (const source of sources) {
    if (keyFacts.length >= MAX_KEY_FACTS) {
      break;
    }

    const snippet = trimToKeyFact(source.snippet);
    if (snippet && !keyFacts.includes(snippet)) {
      keyFacts.push(snippet);
    }
  }

  return keyFacts.length > 0 ? keyFacts : undefined;
}

export function buildWebResearchOutput(
  input: WebResearchToolInput,
  tavilyData: unknown,
): WebResearchToolOutput {
  validateWebResearchInput(input);

  const retrievedAt = new Date().toISOString();
  const parsed = parseTavilyResults(tavilyData);
  const sources = parsed.results.map((result) =>
    normalizeEvidenceSource({
      type: 'web',
      retrievedAt,
      metadata: {
        provider: 'tavily',
        query: input.query.trim(),
      },
      ...definedProperty('title', result.title),
      ...definedProperty('url', result.url),
      ...definedProperty('snippet', result.snippet),
      ...definedProperty('score', result.score),
    }),
  );
  const citations = buildCitations(sources);
  const answer = parsed.answer;
  const createBriefOutput = input.createBrief ?? true;
  const brief = createBriefOutput
    ? createBrief({
        language: input.language ?? 'unknown',
        outputFormat: 'report',
        topic: input.briefTopic ?? input.query.trim(),
        goal: input.briefGoal ?? 'Summarize web research findings with citations.',
        sourceIds: [...new Set(sources.map((source) => source.id))],
        metadata: {
          provider: 'tavily',
          query: input.query.trim(),
        },
        ...definedProperty('keyFacts', buildKeyFacts(answer, sources)),
      })
    : undefined;

  const output: WebResearchToolOutput = {
    query: input.query.trim(),
    sources,
    citations,
    rawResultSummary: {
      resultCount: sources.length,
      hasAnswer: Boolean(answer),
      hasRawContent: parsed.hasRawContent,
    },
  };

  if (answer !== undefined) {
    output.answer = answer;
  }

  if (brief !== undefined) {
    output.brief = brief;
  }

  return output;
}

export async function executeWebResearchTool(input: WebResearchToolInput) {
  try {
    validateWebResearchInput(input);

    const searchResult = await searchTavily(resolveSearchInput(input));
    return toolSuccess(buildWebResearchOutput(input, searchResult));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const webResearchTool = tool({
  name: 'web_research',
  description:
    'Run a lightweight web research workflow: search the web, normalize top results into EvidenceSource objects, build citations, and optionally create a research brief. This does not crawl websites or persist results.',
  inputSchema: webResearchInputSchema,
  callback: executeWebResearchTool,
});

export { webResearchTool };

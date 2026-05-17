import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';

const TAVILY_API_BASE_URL = 'https://api.tavily.com';

type ToolResponse = {
  status: 'success' | 'error';
  content: Array<{ text: string }>;
};

export type TavilySearchInput = {
  query: string;
  search_depth?: 'basic' | 'advanced';
  topic?: 'general' | 'news';
  max_results?: number;
  time_range?: 'day' | 'week' | 'month' | 'year' | 'd' | 'w' | 'm' | 'y';
  days?: number;
  start_date?: string;
  end_date?: string;
  include_answer?: boolean | 'basic' | 'advanced';
  include_raw_content?: boolean | 'markdown' | 'text';
  include_domains?: string[];
  exclude_domains?: string[];
  country?: string;
};

const TavilyCategorySchema = z.enum([
  'Careers',
  'Blog',
  'Documentation',
  'About',
  'Pricing',
  'Community',
  'Developers',
  'Contact',
  'Media',
]);

let apiKeyPromise: Promise<string> | null = null;

function success(data: unknown): ToolResponse {
  return {
    status: 'success',
    content: [{ text: JSON.stringify(data) }],
  };
}

function failure(message: string): ToolResponse {
  return {
    status: 'error',
    content: [{ text: message }],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const MAX_CONTENT_CHARS = 5000;
const MAX_ANSWER_CHARS = 2000;
const MAX_TAVILY_SEARCH_RESULTS = 5;

export function resolveMaxResults(requested: number | undefined): number {
  return Math.min(requested ?? MAX_TAVILY_SEARCH_RESULTS, MAX_TAVILY_SEARCH_RESULTS);
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function truncateString(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string' || value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…[truncated]`;
}

function boundResultItem(item: unknown): unknown {
  if (!isRecord(item)) {
    return item;
  }
  return {
    ...item,
    ...(item.content !== undefined && {
      content: truncateString(item.content, MAX_CONTENT_CHARS),
    }),
    ...(item.raw_content !== undefined && {
      raw_content: truncateString(item.raw_content, MAX_CONTENT_CHARS),
    }),
  };
}

function boundTavilyPayload(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }
  const bounded: Record<string, unknown> = { ...data };
  if (bounded.answer !== undefined) {
    bounded.answer = truncateString(bounded.answer, MAX_ANSWER_CHARS);
  }
  if (Array.isArray(bounded.results)) {
    bounded.results = bounded.results.map(boundResultItem);
  }
  return bounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveAwsRegion(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
}

function resolveSecretString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (isRecord(value)) {
    const nested = value.TAVILY_API_KEY;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  return null;
}

async function getApiKeyFromSecretsManager(secretId: string): Promise<string> {
  const client = new SecretsManagerClient({ region: resolveAwsRegion() });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (response.SecretString) {
    const raw = response.SecretString;

    try {
      const parsed: unknown = JSON.parse(raw);
      const fromJson = resolveSecretString(parsed);
      if (fromJson) {
        return fromJson;
      }
    } catch {
      const plain = resolveSecretString(raw);
      if (plain) {
        return plain;
      }
    }
  }

  if (response.SecretBinary) {
    const binary = Buffer.from(response.SecretBinary).toString('utf8');

    try {
      const parsed: unknown = JSON.parse(binary);
      const fromJson = resolveSecretString(parsed);
      if (fromJson) {
        return fromJson;
      }
    } catch {
      const plain = resolveSecretString(binary);
      if (plain) {
        return plain;
      }
    }
  }

  throw new Error(
    'Secrets Manager value is empty or missing the TAVILY_API_KEY field.' +
      ' Expected JSON: {"TAVILY_API_KEY": "tvly-..."}',
  );
}

async function getApiKeyFromSsm(parameterName: string): Promise<string> {
  const client = new SSMClient({ region: resolveAwsRegion() });
  const response = await client.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    }),
  );

  const value = response.Parameter?.Value?.trim();
  if (!value) {
    throw new Error('SSM parameter value is empty.');
  }

  return value;
}

async function loadApiKey(): Promise<string> {
  const directKey = process.env.TAVILY_API_KEY?.trim();
  if (directKey) {
    return directKey;
  }

  const secretId = process.env.TAVILY_API_KEY_SECRET_ID?.trim();
  if (secretId) {
    return getApiKeyFromSecretsManager(secretId);
  }

  const parameterName = process.env.TAVILY_API_KEY_SSM_NAME?.trim();
  if (parameterName) {
    return getApiKeyFromSsm(parameterName);
  }

  throw new Error(
    'TAVILY_API_KEY, TAVILY_API_KEY_SECRET_ID, or TAVILY_API_KEY_SSM_NAME env var is not set.' +
      ' The secret must be JSON: {"TAVILY_API_KEY": "tvly-..."}',
  );
}

async function getApiKey(): Promise<string> {
  if (!apiKeyPromise) {
    apiKeyPromise = loadApiKey().catch((error: unknown) => {
      apiKeyPromise = null;
      throw error;
    });
  }

  return apiKeyPromise;
}

async function postTavily(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<{ data?: unknown; error?: string }> {
  let apiKey: string;
  try {
    apiKey = await getApiKey();
  } catch (error) {
    return { error: errorMessage(error) };
  }

  let response: Response;
  try {
    response = await fetch(`${TAVILY_API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { error: 'Connection error. Please check your internet connection.' };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    return { error: `Failed to parse API response: ${errorMessage(error)}` };
  }

  if (!response.ok) {
    if (isRecord(data) && typeof data.error === 'string') {
      return { error: data.error };
    }

    return { error: `Tavily API request failed with status ${response.status}` };
  }

  return { data };
}

export async function searchTavily(input: TavilySearchInput): Promise<unknown> {
  const response = await postTavily(
    '/search',
    compactPayload({
      query: input.query,
      search_depth: input.search_depth,
      topic: input.topic,
      max_results: resolveMaxResults(input.max_results),
      time_range: input.time_range,
      days: input.days,
      start_date: input.start_date,
      end_date: input.end_date,
      include_answer: input.include_answer,
      include_raw_content: input.include_raw_content,
      include_domains: input.include_domains,
      exclude_domains: input.exclude_domains,
      country: input.country,
    }),
  );

  if (response.error) {
    throw new Error(response.error);
  }

  return response.data;
}

const tavilySearchTool = tool({
  name: 'tavily_search',
  description:
    'Search the web for real-time information using Tavily AI search. Supports filters like topic, time range, domains, and image options.',
  inputSchema: z.object({
    query: z.string().describe('The search query to execute.'),
    search_depth: z.enum(['basic', 'advanced']).optional(),
    topic: z.enum(['general', 'news']).optional(),
    max_results: z.number().int().optional(),
    auto_parameters: z.boolean().optional(),
    chunks_per_source: z.number().int().optional(),
    time_range: z.enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y']).optional(),
    days: z.number().int().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    include_answer: z.union([z.boolean(), z.enum(['basic', 'advanced'])]).optional(),
    include_raw_content: z.union([z.boolean(), z.enum(['markdown', 'text'])]).optional(),
    include_images: z.boolean().optional(),
    include_image_descriptions: z.boolean().optional(),
    include_favicon: z.boolean().optional(),
    include_domains: z.array(z.string()).optional(),
    exclude_domains: z.array(z.string()).optional(),
    country: z.string().optional(),
  }),
  callback: async (input) => {
    try {
      const query = input.query?.trim();
      if (!query) {
        return failure('Query parameter is required and cannot be empty');
      }

      if (
        input.max_results !== undefined &&
        (input.max_results < 0 || input.max_results > 20)
      ) {
        return failure('max_results must be between 0 and 20');
      }

      if (
        input.chunks_per_source !== undefined &&
        (input.chunks_per_source < 1 || input.chunks_per_source > 3)
      ) {
        return failure('chunks_per_source must be between 1 and 3');
      }

      const result = await postTavily(
        '/search',
        compactPayload({
          ...input,
          query,
          max_results: resolveMaxResults(input.max_results),
        }),
      );

      if (result.error) {
        return failure(result.error);
      }

      return success(boundTavilyPayload(result.data));
    } catch (error) {
      return failure(`Unexpected error: ${errorMessage(error)}`);
    }
  },
});

const tavilyExtractTool = tool({
  name: 'tavily_extract',
  description:
    'Extract clean structured content from one or more URLs using Tavily extraction API.',
  inputSchema: z.object({
    urls: z
      .union([z.string(), z.array(z.string())])
      .describe('A single URL string or list of URL strings.'),
    extract_depth: z.enum(['basic', 'advanced']).optional(),
    format: z.enum(['markdown', 'text']).optional(),
    include_images: z.boolean().optional(),
    include_favicon: z.boolean().optional(),
  }),
  callback: async (input) => {
    try {
      const { urls } = input;

      if (typeof urls === 'string' && !urls.trim()) {
        return failure('At least one URL must be provided');
      }

      if (Array.isArray(urls) && urls.length === 0) {
        return failure('At least one URL must be provided');
      }

      const result = await postTavily('/extract', compactPayload(input));
      if (result.error) {
        return failure(result.error);
      }

      return success(boundTavilyPayload(result.data));
    } catch (error) {
      return failure(`Unexpected error: ${errorMessage(error)}`);
    }
  },
});

const tavilyCrawlTool = tool({
  name: 'tavily_crawl',
  description:
    'Crawl multiple pages from a website with Tavily graph-based traversal and content extraction.',
  inputSchema: z.object({
    url: z.string().describe('The root URL to begin crawling from.'),
    max_depth: z.number().int().optional(),
    max_breadth: z.number().int().optional(),
    limit: z.number().int().optional(),
    instructions: z.string().optional(),
    select_paths: z.array(z.string()).optional(),
    select_domains: z.array(z.string()).optional(),
    exclude_paths: z.array(z.string()).optional(),
    exclude_domains: z.array(z.string()).optional(),
    allow_external: z.boolean().optional(),
    include_images: z.boolean().optional(),
    categories: z.array(TavilyCategorySchema).optional(),
    extract_depth: z.enum(['basic', 'advanced']).optional(),
    format: z.enum(['markdown', 'text']).optional(),
    include_favicon: z.boolean().optional(),
  }),
  callback: async (input) => {
    try {
      const url = input.url?.trim();
      if (!url) {
        return failure('URL parameter is required and cannot be empty');
      }

      if (input.max_depth !== undefined && input.max_depth < 1) {
        return failure('max_depth must be at least 1');
      }

      if (input.max_breadth !== undefined && input.max_breadth < 1) {
        return failure('max_breadth must be at least 1');
      }

      if (input.limit !== undefined && input.limit < 1) {
        return failure('limit must be at least 1');
      }

      const result = await postTavily(
        '/crawl',
        compactPayload({
          ...input,
          url,
        }),
      );

      if (result.error) {
        return failure(result.error);
      }

      return success(boundTavilyPayload(result.data));
    } catch (error) {
      return failure(`Unexpected error: ${errorMessage(error)}`);
    }
  },
});

const tavilyMapTool = tool({
  name: 'tavily_map',
  description:
    'Map website structure and discover URLs from a base URL using Tavily mapping API.',
  inputSchema: z.object({
    url: z.string().describe('The root URL to begin mapping from.'),
    max_depth: z.number().int().optional(),
    max_breadth: z.number().int().optional(),
    limit: z.number().int().optional(),
    instructions: z.string().optional(),
    select_paths: z.array(z.string()).optional(),
    select_domains: z.array(z.string()).optional(),
    exclude_paths: z.array(z.string()).optional(),
    exclude_domains: z.array(z.string()).optional(),
    allow_external: z.boolean().optional(),
    categories: z.array(TavilyCategorySchema).optional(),
  }),
  callback: async (input) => {
    try {
      const url = input.url?.trim();
      if (!url) {
        return failure('URL parameter is required and cannot be empty');
      }

      if (input.max_depth !== undefined && input.max_depth < 1) {
        return failure('max_depth must be at least 1');
      }

      if (input.max_breadth !== undefined && input.max_breadth < 1) {
        return failure('max_breadth must be at least 1');
      }

      if (input.limit !== undefined && input.limit < 1) {
        return failure('limit must be at least 1');
      }

      const result = await postTavily(
        '/map',
        compactPayload({
          ...input,
          url,
        }),
      );

      if (result.error) {
        return failure(result.error);
      }

      return success(result.data);
    } catch (error) {
      return failure(`Unexpected error: ${errorMessage(error)}`);
    }
  },
});

export {
  boundTavilyPayload,
  tavilyCrawlTool,
  tavilyExtractTool,
  tavilyMapTool,
  tavilySearchTool,
};

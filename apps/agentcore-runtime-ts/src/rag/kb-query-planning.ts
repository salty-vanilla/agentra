import { uuidv7 } from 'uuidv7';
import type {
  KbQueryPlan,
  KbQueryPlanInput,
  KbRetrievalIntent,
} from './kb-query-planning-types.js';

const DEFAULT_TOP_K = 5;
const MAX_QUERY_LENGTH = 2000;
const MIN_QUERY_LENGTH_FOR_CLARIFICATION = 8;
const MIN_WORD_COUNT_FOR_CLARIFICATION = 2;

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = trimText(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }

  return deduped.size > 0 ? [...deduped] : [];
}

function normalizeNumber(value: number | undefined, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  return value;
}

function validateTopK(topK: number | undefined): number {
  const resolved = topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 20) {
    throw new Error('topK must be an integer between 1 and 20');
  }

  return resolved;
}

function countWords(query: string): number {
  return query
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function inferIntentFromQuery(query: string): KbRetrievalIntent {
  const normalized = query.toLowerCase();

  if (
    normalized.includes('how to') ||
    normalized.includes('手順') ||
    normalized.includes('方法') ||
    normalized.includes('やり方')
  ) {
    return 'how_to';
  }

  if (
    normalized.includes('error') ||
    normalized.includes('failure') ||
    normalized.includes('troubleshoot') ||
    normalized.includes('原因') ||
    normalized.includes('対処') ||
    normalized.includes('障害')
  ) {
    return 'troubleshooting';
  }

  if (
    normalized.includes('policy') ||
    normalized.includes('rule') ||
    normalized.includes('規約') ||
    normalized.includes('ポリシー') ||
    normalized.includes('ルール')
  ) {
    return 'policy_lookup';
  }

  if (
    normalized.includes('spec') ||
    normalized.includes('仕様') ||
    normalized.includes('設計') ||
    normalized.includes('api')
  ) {
    return 'spec_lookup';
  }

  if (
    normalized.includes('compare') ||
    normalized.includes('comparison') ||
    normalized.includes('比較') ||
    normalized.includes('違い')
  ) {
    return 'comparison';
  }

  if (
    normalized.includes('summarize') ||
    normalized.includes('summary') ||
    normalized.includes('まとめ') ||
    normalized.includes('要約')
  ) {
    return 'summary';
  }

  if (
    normalized.includes('document') ||
    normalized.includes('doc') ||
    normalized.includes('file') ||
    normalized.includes('資料') ||
    normalized.includes('文書')
  ) {
    return 'document_lookup';
  }

  return 'unknown';
}

function resolveIntent(
  inputIntent: KbRetrievalIntent | undefined,
  query: string,
): {
  intent: KbRetrievalIntent;
  confidence: number;
} {
  if (inputIntent !== undefined) {
    return {
      intent: inputIntent,
      confidence: 0.95,
    };
  }

  const inferred = inferIntentFromQuery(query);
  if (inferred === 'unknown') {
    return {
      intent: query.length >= MIN_QUERY_LENGTH_FOR_CLARIFICATION ? 'document_lookup' : inferred,
      confidence: 0.35,
    };
  }

  return {
    intent: inferred,
    confidence: 0.75,
  };
}

function inferMissingContext(query: string): string[] | undefined {
  const missing = new Set<string>();
  const wordCount = countWords(query);

  if (query.length < MIN_QUERY_LENGTH_FOR_CLARIFICATION || wordCount < MIN_WORD_COUNT_FOR_CLARIFICATION) {
    missing.add('document topic');
  }

  return missing.size > 0 ? [...missing] : undefined;
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    planner: 'deterministic-kb-query-planner',
  };
}

export function createKbQueryPlan(input: KbQueryPlanInput): KbQueryPlan {
  const query = input.query.trim();
  if (!query) {
    throw new Error('query must not be empty');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query must not exceed ${MAX_QUERY_LENGTH} characters`);
  }

  const topK = validateTopK(input.topK);
  const scoreThreshold = normalizeNumber(input.scoreThreshold, 'scoreThreshold');
  const queryRewriteHint = trimText(input.queryRewriteHint);
  const expectedSourceTypes = normalizeStringArray(input.expectedSourceTypes);
  const metadataFilterHints = normalizeStringArray(input.metadataFilterHints);
  const missingContext = inferMissingContext(query);
  const { intent, confidence } = resolveIntent(input.intent, query);

  return {
    id: uuidv7(),
    createdAt: new Date().toISOString(),
    query,
    intent,
    topK,
    ...(scoreThreshold !== undefined ? { scoreThreshold } : {}),
    ...(queryRewriteHint !== undefined ? { queryRewriteHint } : {}),
    ...(expectedSourceTypes !== undefined ? { expectedSourceTypes } : {}),
    ...(metadataFilterHints !== undefined ? { metadataFilterHints } : {}),
    ...(missingContext !== undefined ? { missingContext } : {}),
    confidence,
    metadata: normalizeMetadata(input.metadata),
  };
}

import type { KbQueryPlan } from './kb-query-planning-types.js';
import type {
  KbRetrievalNextAction,
  KbRetrievalReadinessInput,
  KbRetrievalReadinessResult,
  KbRetrievalReadinessStatus,
} from './kb-retrieval-readiness-types.js';

const READINESS_MARKER = 'kb-retrieval-readiness-v1';
const MIN_QUERY_LENGTH_FOR_CLARIFICATION = 8;
const MIN_WORD_COUNT_FOR_CLARIFICATION = 2;

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = trimText(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }

  return [...deduped];
}

function countWords(query: string): number {
  return query
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

// CJK scripts (Japanese, Chinese, Korean) don't use whitespace between words,
// so word-count checks are meaningless for them — character length is sufficient.
const CJK_PATTERN = /[　-鿿豈-﫿가-힯]/u;

function hasCjkCharacters(text: string): boolean {
  return CJK_PATTERN.test(text);
}

function resolveQuerySpecificity(plan: KbQueryPlan): string[] {
  const missingContext = normalizeStringArray(plan.missingContext);
  const query = trimText(plan.query) ?? '';
  const derivedMissingContext =
    query.length < MIN_QUERY_LENGTH_FOR_CLARIFICATION ||
    (!hasCjkCharacters(query) && countWords(query) < MIN_WORD_COUNT_FOR_CLARIFICATION)
      ? ['document topic']
      : [];

  return [...new Set([...missingContext, ...derivedMissingContext])];
}

function hasEnoughQuerySignal(plan: KbQueryPlan): boolean {
  const query = trimText(plan.query);
  if (query === undefined) {
    return false;
  }

  return (
    query.length >= MIN_QUERY_LENGTH_FOR_CLARIFICATION &&
    (hasCjkCharacters(query) || countWords(query) >= MIN_WORD_COUNT_FOR_CLARIFICATION)
  );
}

function determineNextAction(status: KbRetrievalReadinessStatus): KbRetrievalNextAction {
  switch (status) {
    case 'ready':
      return 'retrieve_kb';
    case 'needs_clarification':
      return 'ask_follow_up';
    case 'fallback_recommended':
      return 'fallback_to_web_research';
    case 'not_configured':
      return 'run_diagnostics';
    case 'unsupported':
      return 'not_supported';
  }
}

function buildRationale(
  input: KbRetrievalReadinessInput,
  status: KbRetrievalReadinessStatus,
  missingContext: string[],
): string[] {
  const rationale: string[] = [];

  if (missingContext.length > 0) {
    rationale.push(`Query needs more context: ${missingContext.join(', ')}.`);
  }

  if (status === 'needs_clarification' && rationale.length === 0) {
    rationale.push('Query is too short or too ambiguous for KB retrieval.');
  }

  if (status === 'ready') {
    rationale.push('KB retrieval is configured and the query is ready to retrieve.');
  }

  if (status === 'not_configured') {
    if (input.kbRetrieveEnabled === false) {
      rationale.push('KB retrieve is disabled.');
    }
    if (input.knowledgeBaseConfigured === false) {
      rationale.push('Knowledge Base ID is not configured.');
    }
  }

  if (status === 'fallback_recommended') {
    rationale.push('KB retrieval is unavailable, so web research is recommended.');
  }

  if (status === 'unsupported') {
    rationale.push('This query cannot be evaluated for KB retrieval readiness.');
  }

  return rationale;
}

function buildWarnings(plan: KbQueryPlan): string[] {
  const warnings: string[] = [];

  if (plan.intent === 'unknown') {
    warnings.push('Intent is unknown; retrieval will use a broad document lookup.');
  }

  if ((plan.scoreThreshold ?? 0) > 0.8) {
    warnings.push('A high score threshold may reduce recall.');
  }

  return warnings;
}

export function evaluateKbRetrievalReadiness(
  input: KbRetrievalReadinessInput,
): KbRetrievalReadinessResult {
  const missingContext = resolveQuerySpecificity(input.plan);
  const queryReady = hasEnoughQuerySignal(input.plan);
  const warnings = buildWarnings(input.plan);
  let status: KbRetrievalReadinessStatus = 'ready';

  if (!queryReady || missingContext.length > 0) {
    status = 'needs_clarification';
  } else if (
    input.kbRetrieveEnabled === false ||
    input.knowledgeBaseConfigured === false
  ) {
    status = input.allowWebFallback === true ? 'fallback_recommended' : 'not_configured';
  }

  const nextAction = determineNextAction(status);
  const rationale = buildRationale(input, status, missingContext);

  return {
    status,
    executable: status === 'ready',
    nextAction,
    missingContext,
    warnings,
    rationale,
    plan: input.plan,
    metadata: {
      ...(input.metadata ?? {}),
      readiness: READINESS_MARKER,
    },
  };
}

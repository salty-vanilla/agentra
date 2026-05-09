import {
  type Brief,
  type Citation,
  createBrief,
  type EvidenceSource,
} from '@agentra/agent-tools';
import type {
  KbAnswerSynthesisInput,
  KbAnswerSynthesisOutput,
  KbAnswerSynthesisStatus,
  KbRagFlowOutput,
} from './kb-answer-synthesis-types.js';

const SYNTHESIZER_ID = 'kb-answer-synthesis-v1';
const DEFAULT_SOURCE_PREVIEW_LIMIT = 5;
const MAX_SOURCE_PREVIEW_LIMIT = 20;
const MAX_KEY_FINDINGS = 10;
const MAX_KEY_FACT_LENGTH = 280;
const WEAK_EVIDENCE_SCORE_THRESHOLD = 0.5;

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

function trimToKeyFact(value: string | undefined): string | undefined {
  const trimmed = trimText(value);
  return trimmed ? truncateText(trimmed, MAX_KEY_FACT_LENGTH) : undefined;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = trimText(value);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function collectSources(flow: KbRagFlowOutput): EvidenceSource[] {
  return (flow.retrieval?.sources ?? []) as EvidenceSource[];
}

function collectCitations(flow: KbRagFlowOutput): Citation[] {
  return (flow.retrieval?.citations ?? []) as Citation[];
}

function hasWeakEvidence(sources: EvidenceSource[]): boolean {
  if (sources.length === 0) {
    return false;
  }

  const definedScores = sources
    .map((source) => source.score)
    .filter(
      (score): score is number => typeof score === 'number' && Number.isFinite(score),
    );
  const allBelowThreshold =
    definedScores.length > 0 &&
    definedScores.every((score) => score < WEAK_EVIDENCE_SCORE_THRESHOLD);

  return sources.length < 2 || allBelowThreshold;
}

function resolveStatus(flow: KbRagFlowOutput): KbAnswerSynthesisStatus {
  switch (flow.status) {
    case 'needs_clarification':
    case 'not_configured':
    case 'fallback_recommended':
    case 'error':
      return flow.status;
    case 'answer_ready': {
      const sources = collectSources(flow);
      if (sources.length === 0) {
        return 'no_results';
      }

      return hasWeakEvidence(sources) ? 'weak_evidence' : 'answer_ready';
    }
    default:
      return 'error';
  }
}

function resolveTitle(input: {
  flow: KbRagFlowOutput;
  status: KbAnswerSynthesisStatus;
}): string {
  const query = trimText(input.flow.retrieval?.query);
  const base = query ? truncateText(query, 72) : 'Knowledge base answer';

  switch (input.status) {
    case 'answer_ready':
      return `KB answer: ${base}`;
    case 'needs_clarification':
      return query
        ? `KB answer needs clarification: ${base}`
        : 'KB answer needs clarification';
    case 'not_configured':
      return query ? `KB answer not configured: ${base}` : 'KB answer not configured';
    case 'fallback_recommended':
      return query ? `KB fallback recommended: ${base}` : 'KB fallback recommended';
    case 'no_results':
      return query ? `KB answer not found: ${base}` : 'KB answer not found';
    case 'weak_evidence':
      return query
        ? `KB answer needs stronger evidence: ${base}`
        : 'KB answer needs stronger evidence';
    default:
      return query ? `KB answer synthesis error: ${base}` : 'KB answer synthesis error';
  }
}

function buildSummary(input: {
  status: KbAnswerSynthesisStatus;
  sourceCount: number;
}): string {
  switch (input.status) {
    case 'answer_ready':
      return `KB retrieval returned ${input.sourceCount} source${input.sourceCount === 1 ? '' : 's'}.`;
    case 'needs_clarification':
      return 'More context is needed before this KB answer can be synthesized safely.';
    case 'not_configured':
      return 'The knowledge base is not configured for retrieval.';
    case 'fallback_recommended':
      return 'KB retrieval is not ready, so fallback may be needed.';
    case 'no_results':
      return 'No knowledge base sources were retrieved.';
    case 'weak_evidence':
      return 'KB retrieval returned sources, but the evidence looks weak or sparse.';
    default:
      return 'KB answer synthesis could not normalize the flow output.';
  }
}

function buildKeyFindings(retrieval: KbRagFlowOutput['retrieval']): string[] {
  const findings: string[] = [];
  const briefFacts = retrieval?.brief?.keyFacts ?? [];
  if (briefFacts.length > 0) {
    findings.push(
      ...briefFacts.map((value) => trimToKeyFact(value) ?? '').filter((value) => value),
    );
  } else {
    for (const source of retrieval?.sources ?? []) {
      if (findings.length >= MAX_KEY_FINDINGS) {
        break;
      }

      const snippet = trimToKeyFact(source.snippet);
      if (snippet && !findings.includes(snippet)) {
        findings.push(snippet);
      }
    }
  }

  return dedupeStrings(findings).slice(0, MAX_KEY_FINDINGS);
}

function buildCaveats(input: {
  status: KbAnswerSynthesisStatus;
  sources: EvidenceSource[];
  citations: Citation[];
}): string[] {
  const caveats: string[] = [];

  if (input.sources.length === 0) {
    caveats.push('No knowledge base sources were retrieved.');
  }

  if (input.citations.length === 0) {
    caveats.push('No citations were available.');
  }

  if (input.status === 'weak_evidence') {
    caveats.push('Retrieved evidence may be insufficient.');
  }

  if (input.status === 'fallback_recommended') {
    caveats.push('Knowledge base retrieval was not ready; fallback may be needed.');
  }

  return dedupeStrings(caveats);
}

function buildNextActions(input: { status: KbAnswerSynthesisStatus }): string[] {
  switch (input.status) {
    case 'needs_clarification':
      return ['Ask for the missing context, then rerun KB retrieval.'];
    case 'not_configured':
      return ['Run KB diagnostics or configure the knowledge base before answering.'];
    case 'fallback_recommended':
      return ['Use web fallback or another grounded source until KB retrieval is ready.'];
    case 'no_results':
      return ['Refine the query, adjust metadata filters, or fall back to web research.'];
    case 'weak_evidence':
      return [
        'Narrow the query, improve evidence quality, or gather additional sources.',
      ];
    case 'answer_ready':
      return [
        'Use the retrieved sources as grounded evidence for the final response, report, or slide.',
      ];
    default:
      return [
        'Inspect the KB flow output and retry after fixing the retrieval or wiring issue.',
      ];
  }
}

function buildSourcePreview(input: {
  sources: EvidenceSource[];
  includeSourcePreview: boolean | undefined;
  maxSources: number | undefined;
}): Array<{ title?: string; snippet?: string; score?: number }> | undefined {
  if (input.includeSourcePreview !== true || input.sources.length === 0) {
    return undefined;
  }

  const limit = Math.min(
    MAX_SOURCE_PREVIEW_LIMIT,
    input.maxSources ?? DEFAULT_SOURCE_PREVIEW_LIMIT,
  );

  if (limit <= 0) {
    return undefined;
  }

  return input.sources.slice(0, limit).map((source) => ({
    ...definedProperty('title', trimText(source.title)),
    ...definedProperty('snippet', trimToKeyFact(source.snippet)),
    ...definedProperty('score', source.score),
  }));
}

function buildBrief(input: {
  flow: KbRagFlowOutput;
  status: KbAnswerSynthesisStatus;
  keyFindings: string[];
  sources: EvidenceSource[];
  createBrief: boolean | undefined;
}): Brief | undefined {
  if (input.createBrief === false) {
    return undefined;
  }

  const existingBrief = input.flow.retrieval?.brief;
  if (existingBrief !== undefined) {
    return {
      ...existingBrief,
      metadata: {
        ...(existingBrief.metadata ?? {}),
        synthesizer: SYNTHESIZER_ID,
      },
    } as Brief;
  }

  if (input.sources.length === 0) {
    return undefined;
  }

  return createBrief({
    language: 'unknown',
    outputFormat: 'report',
    topic: trimText(input.flow.retrieval?.query) ?? 'Knowledge base answer',
    goal: 'Summarize KB evidence with citations.',
    keyFacts: input.keyFindings,
    sourceIds: input.sources.map((source) => source.id),
    metadata: {
      ...(input.flow.metadata ?? {}),
      status: input.status,
      synthesizer: SYNTHESIZER_ID,
      query: input.flow.retrieval?.query,
    },
  });
}

function buildMetadata(input: {
  flow: KbRagFlowOutput;
  status: KbAnswerSynthesisStatus;
  metadata: Record<string, unknown> | undefined;
  sources: EvidenceSource[];
  citations: Citation[];
}): Record<string, unknown> {
  return {
    ...(input.flow.metadata ?? {}),
    ...(input.metadata ?? {}),
    status: input.status,
    sourceCount: input.sources.length,
    citationCount: input.citations.length,
    synthesizer: SYNTHESIZER_ID,
  };
}

export function synthesizeKbAnswer(
  input: KbAnswerSynthesisInput,
): KbAnswerSynthesisOutput {
  const status = resolveStatus(input.flow);
  const sources = collectSources(input.flow);
  const citations = collectCitations(input.flow);
  const keyFindings = buildKeyFindings(input.flow.retrieval);
  const summary = buildSummary({
    status,
    sourceCount: sources.length,
  });
  const caveats = buildCaveats({
    status,
    sources,
    citations,
  });
  const nextActions = buildNextActions({ status });
  const brief = buildBrief({
    flow: input.flow,
    status,
    keyFindings,
    sources,
    createBrief: input.createBrief,
  });

  return {
    status,
    title: resolveTitle({ flow: input.flow, status }),
    summary,
    keyFindings,
    caveats,
    nextActions,
    sources,
    citations,
    ...(brief !== undefined ? { brief } : {}),
    ...definedProperty(
      'sourcePreview',
      buildSourcePreview({
        sources,
        includeSourcePreview: input.includeSourcePreview,
        maxSources: input.maxSources,
      }),
    ),
    metadata: buildMetadata({
      flow: input.flow,
      status,
      metadata: input.metadata,
      sources,
      citations,
    }),
  };
}

import {
  compactRecord,
  compactStringArray,
  createStableId,
  normalizeText,
} from '../internal.js';
import type { Brief } from './brief-types.js';

function normalizeCreatedAt(createdAt?: string): string {
  return normalizeText(createdAt) ?? new Date().toISOString();
}

function normalizeBriefStrings(values?: string[]): string[] | undefined {
  return compactStringArray(values);
}

function buildBriefId(input: Omit<Brief, 'id' | 'createdAt'>, createdAt: string): string {
  return createStableId('brief', {
    createdAt,
    language: input.language,
    audience: input.audience,
    outputFormat: input.outputFormat,
    topic: normalizeText(input.topic),
    goal: normalizeText(input.goal),
    constraints: normalizeBriefStrings(input.constraints),
    keyFacts: normalizeBriefStrings(input.keyFacts),
    openQuestions: normalizeBriefStrings(input.openQuestions),
    sourceIds: normalizeBriefStrings(input.sourceIds),
    metadata: input.metadata ? compactRecord(input.metadata) : undefined,
  });
}

function mergeStringArrays(base?: string[], patch?: string[]): string[] | undefined {
  const merged = [
    ...(base ?? []),
    ...(patch ?? [])
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value)),
  ];
  const deduped = [...new Set(merged)];
  return deduped.length > 0 ? deduped : undefined;
}

export function createBrief(
  input: Omit<Brief, 'id' | 'createdAt'> & {
    idHint?: string;
    createdAt?: string;
  },
): Brief {
  const createdAt = normalizeCreatedAt(input.createdAt);
  const id = normalizeText(input.idHint) ?? buildBriefId(input, createdAt);

  const brief: Brief = {
    id,
    createdAt,
  };

  const topic = normalizeText(input.topic);
  const goal = normalizeText(input.goal);
  const constraints = normalizeBriefStrings(input.constraints);
  const keyFacts = normalizeBriefStrings(input.keyFacts);
  const openQuestions = normalizeBriefStrings(input.openQuestions);
  const sourceIds = normalizeBriefStrings(input.sourceIds);
  const metadata = input.metadata ? compactRecord(input.metadata) : undefined;

  if (input.language) brief.language = input.language;
  if (input.audience) brief.audience = input.audience;
  if (input.outputFormat) brief.outputFormat = input.outputFormat;
  if (topic) brief.topic = topic;
  if (goal) brief.goal = goal;
  if (constraints) brief.constraints = constraints;
  if (keyFacts) brief.keyFacts = keyFacts;
  if (openQuestions) brief.openQuestions = openQuestions;
  if (sourceIds) brief.sourceIds = sourceIds;
  if (metadata && Object.keys(metadata).length > 0) brief.metadata = metadata;

  return brief;
}

export function mergeBriefs(base: Brief, patch: Partial<Brief>): Brief {
  const metadata = patch.metadata
    ? {
        ...(base.metadata ?? {}),
        ...patch.metadata,
      }
    : base.metadata;

  const merged: Brief = {
    ...base,
    ...patch,
    id: base.id,
    createdAt: base.createdAt,
  };

  if (patch.language !== undefined) {
    merged.language = patch.language;
  }
  if (patch.audience !== undefined) {
    merged.audience = patch.audience;
  }
  if (patch.outputFormat !== undefined) {
    merged.outputFormat = patch.outputFormat;
  }

  const topic = normalizeText(patch.topic);
  const goal = normalizeText(patch.goal);
  if (topic !== undefined) {
    merged.topic = topic;
  }
  if (goal !== undefined) {
    merged.goal = goal;
  }

  const constraints = mergeStringArrays(base.constraints, patch.constraints);
  const keyFacts = mergeStringArrays(base.keyFacts, patch.keyFacts);
  const openQuestions = mergeStringArrays(base.openQuestions, patch.openQuestions);
  const sourceIds = mergeStringArrays(base.sourceIds, patch.sourceIds);

  if (constraints) merged.constraints = constraints;
  if (keyFacts) merged.keyFacts = keyFacts;
  if (openQuestions) merged.openQuestions = openQuestions;
  if (sourceIds) merged.sourceIds = sourceIds;

  if (metadata && Object.keys(metadata).length > 0) {
    merged.metadata = compactRecord(metadata);
  } else {
    delete merged.metadata;
  }

  return merged;
}

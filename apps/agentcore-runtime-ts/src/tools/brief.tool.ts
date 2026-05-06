import {
  type Brief,
  type BriefAudience,
  type BriefOutputFormat,
  createBrief,
  mergeBriefs,
} from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_TEXT_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 100;
const MAX_METADATA_KEYS = 100;

const briefAudienceSchema = z.enum([
  'executive',
  'engineer',
  'sales',
  'general',
  'unknown',
]);

const briefOutputFormatSchema = z.enum([
  'chat',
  'presentation',
  'report',
  'json',
  'unknown',
]);

const briefLanguageSchema = z.enum(['ja', 'en', 'unknown']);

const briefSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  language: briefLanguageSchema.optional(),
  audience: briefAudienceSchema.optional(),
  outputFormat: briefOutputFormatSchema.optional(),
  topic: z.string().optional(),
  goal: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  keyFacts: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createBriefInputSchema = z.object({
  language: briefLanguageSchema.optional(),
  audience: briefAudienceSchema.optional(),
  outputFormat: briefOutputFormatSchema.optional(),
  topic: z.string().optional(),
  goal: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  keyFacts: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idHint: z.string().optional(),
  createdAt: z.string().optional(),
});

const mergeBriefsInputSchema = z.object({
  base: briefSchema,
  patch: z.object({
    id: z.string().optional(),
    createdAt: z.string().optional(),
    language: briefLanguageSchema.optional(),
    audience: briefAudienceSchema.optional(),
    outputFormat: briefOutputFormatSchema.optional(),
    topic: z.string().optional(),
    goal: z.string().optional(),
    constraints: z.array(z.string()).optional(),
    keyFacts: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
    sourceIds: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

type BriefToolInputBase = {
  language?: 'ja' | 'en' | 'unknown' | undefined;
  audience?: BriefAudience | undefined;
  outputFormat?: BriefOutputFormat | undefined;
  topic?: string | undefined;
  goal?: string | undefined;
  constraints?: string[] | undefined;
  keyFacts?: string[] | undefined;
  openQuestions?: string[] | undefined;
  sourceIds?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type CreateBriefToolInput = BriefToolInputBase & {
  idHint?: string | undefined;
  createdAt?: string | undefined;
};

type MergeBriefsPatchInput = {
  id?: string | undefined;
  createdAt?: string | undefined;
  language?: 'ja' | 'en' | 'unknown' | undefined;
  audience?: BriefAudience | undefined;
  outputFormat?: BriefOutputFormat | undefined;
  topic?: string | undefined;
  goal?: string | undefined;
  constraints?: string[] | undefined;
  keyFacts?: string[] | undefined;
  openQuestions?: string[] | undefined;
  sourceIds?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type MergeBriefsToolInput = z.infer<typeof mergeBriefsInputSchema>;

function validateTextField(
  value: string | undefined,
  fieldName: string,
  maxLength: number = MAX_TEXT_LENGTH,
): void {
  if (value !== undefined && value.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
}

function validateArrayField(values: string[] | undefined, fieldName: string): void {
  if (values === undefined) {
    return;
  }

  if (values.length > MAX_ARRAY_ITEMS) {
    throw new Error(`${fieldName} must not exceed ${MAX_ARRAY_ITEMS} items`);
  }

  values.forEach((value, index) => {
    if (value.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `${fieldName}[${index}] must not exceed ${MAX_TEXT_LENGTH} characters`,
      );
    }
  });
}

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  const keys = Object.keys(metadata);
  if (keys.length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateBriefInput(input: BriefToolInputBase): void {
  validateTextField(input.topic, 'topic');
  validateTextField(input.goal, 'goal');
  validateArrayField(input.constraints, 'constraints');
  validateArrayField(input.keyFacts, 'keyFacts');
  validateArrayField(input.openQuestions, 'openQuestions');
  validateArrayField(input.sourceIds, 'sourceIds');
  validateMetadata(input.metadata);
}

function validateCreateBriefInput(input: CreateBriefToolInput): void {
  validateBriefInput(input);
  validateTextField(input.idHint, 'idHint');
  validateTextField(input.createdAt, 'createdAt');
}

function validateBriefPatch(input: MergeBriefsPatchInput): void {
  validateTextField(input.topic, 'topic');
  validateTextField(input.goal, 'goal');
  validateArrayField(input.constraints, 'constraints');
  validateArrayField(input.keyFacts, 'keyFacts');
  validateArrayField(input.openQuestions, 'openQuestions');
  validateArrayField(input.sourceIds, 'sourceIds');
  validateMetadata(input.metadata);
  validateTextField(input.createdAt, 'createdAt');
}

export function executeCreateBriefTool(input: CreateBriefToolInput) {
  try {
    validateCreateBriefInput(input);

    const brief = createBrief({
      ...definedProperty('language', input.language),
      ...definedProperty('audience', input.audience),
      ...definedProperty('outputFormat', input.outputFormat),
      ...definedProperty('topic', input.topic),
      ...definedProperty('goal', input.goal),
      ...definedProperty('constraints', input.constraints),
      ...definedProperty('keyFacts', input.keyFacts),
      ...definedProperty('openQuestions', input.openQuestions),
      ...definedProperty('sourceIds', input.sourceIds),
      ...definedProperty('metadata', input.metadata),
      ...definedProperty('idHint', input.idHint),
      ...definedProperty('createdAt', input.createdAt),
    });

    return toolSuccess(brief);
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

export function executeMergeBriefsTool(input: MergeBriefsToolInput) {
  try {
    const base = input.base as Brief;
    const patch = input.patch as Partial<Brief>;

    validateBriefInput(base);
    validateBriefPatch(input.patch);

    const merged = mergeBriefs(base, patch);

    return toolSuccess(merged);
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const createBriefTool = tool({
  name: 'create_brief',
  description:
    'Create a normalized brief object from explicitly provided user request metadata, key facts, constraints, source IDs, and output requirements. This does not infer missing fields or call an LLM.',
  inputSchema: createBriefInputSchema,
  callback: executeCreateBriefTool,
});

const mergeBriefsTool = tool({
  name: 'merge_briefs',
  description:
    'Merge a base brief with an explicit patch brief. Arrays are merged and deduplicated by the underlying brief utility; metadata is shallow-merged.',
  inputSchema: mergeBriefsInputSchema,
  callback: executeMergeBriefsTool,
});

export { createBriefTool, mergeBriefsTool };

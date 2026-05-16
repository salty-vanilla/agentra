import {
  type SubAgentHandoffMetadata,
  type SubAgentHandoffOutput,
  type SubAgentKind,
  subAgentHandoffOutputSchema,
} from './handoff-types.js';

type NormalizeSubAgentHandoffOutputInput = {
  value: unknown;
  agentKind: SubAgentKind;
  agentName: string;
  handoffMode?: string | undefined;
  fallbackErrorMessage: string;
  metadata?: SubAgentHandoffMetadata | undefined;
};

function trimPreview(value: string): string {
  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

function mergeMetadata(
  metadata: SubAgentHandoffMetadata | undefined,
  extra: Record<string, unknown> | undefined,
): SubAgentHandoffMetadata | undefined {
  const merged = {
    ...(metadata ?? {}),
    ...(extra ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildRawMetadata(value: unknown): SubAgentHandoffMetadata {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return {
      rawValueType: 'string',
      ...(trimmed ? { rawValuePreview: trimPreview(trimmed) } : {}),
    };
  }

  if (Array.isArray(value)) {
    return { rawValueType: 'array' };
  }

  if (value && typeof value === 'object') {
    return { rawValueType: 'object' };
  }

  return { rawValueType: typeof value };
}

function toNormalizedOutput(
  input: NormalizeSubAgentHandoffOutputInput,
  output: SubAgentHandoffOutput,
): SubAgentHandoffOutput {
  return {
    ...output,
    agentKind: output.agentKind ?? input.agentKind,
    agentName: output.agentName ?? input.agentName,
    handoffMode: output.handoffMode ?? input.handoffMode,
    metadata: mergeMetadata(input.metadata, output.metadata),
  };
}

const JSON_FENCE_RE = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/;

function tryExtractJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const match = JSON_FENCE_RE.exec(trimmed);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // fall through
    }
  }

  return undefined;
}

export function normalizeSubAgentHandoffOutput(
  input: NormalizeSubAgentHandoffOutputInput,
): SubAgentHandoffOutput {
  const parsed = subAgentHandoffOutputSchema.safeParse(input.value);
  if (parsed.success) {
    return toNormalizedOutput(input, parsed.data);
  }

  if (typeof input.value === 'string' && input.value.trim()) {
    const extracted = tryExtractJson(input.value);
    if (extracted !== undefined) {
      const extractedParsed = subAgentHandoffOutputSchema.safeParse(extracted);
      if (extractedParsed.success) {
        return toNormalizedOutput(input, {
          ...extractedParsed.data,
          metadata: {
            ...(extractedParsed.data.metadata ?? {}),
            rawValueType: 'string_json',
          },
        });
      }
    }

    return toNormalizedOutput(input, {
      status: 'success',
      agentKind: input.agentKind,
      agentName: input.agentName,
      handoffMode: input.handoffMode,
      answer: input.value.trim(),
      metadata: buildRawMetadata(input.value),
    });
  }

  return toNormalizedOutput(input, {
    status: 'error',
    agentKind: input.agentKind,
    agentName: input.agentName,
    handoffMode: input.handoffMode,
    answer: input.fallbackErrorMessage,
    metadata: buildRawMetadata(input.value),
  });
}

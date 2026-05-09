import type {
  KbRagDiagnosticsCheck,
  KbRagDiagnosticsCheckStatus,
  KbRagDiagnosticsInput,
  KbRagDiagnosticsOutput,
} from './kb-rag-diagnostics-types.js';

const DIAGNOSTICS_MARKER = 'kb-rag-diagnostics-v1';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

type ResolvedKbRagDiagnosticsConfig = {
  knowledgeBaseId?: string | undefined;
  knowledgeBaseIdSource: 'env' | 'missing';
  kbRetrieveEnabled: boolean;
  region: string;
  regionSource: 'BEDROCK_KB_REGION' | 'AWS_REGION' | 'AWS_DEFAULT_REGION' | 'default';
  defaultTopK: number;
  defaultTopKSource: 'BEDROCK_KB_DEFAULT_TOP_K' | 'default';
  defaultTopKRaw?: string | undefined;
  defaultTopKValid: boolean;
};

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

function parseTopK(value: string | undefined): {
  value: number;
  valid: boolean;
} {
  const trimmed = trimText(value);
  if (trimmed === undefined) {
    return {
      value: DEFAULT_TOP_K,
      valid: false,
    };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_TOP_K) {
    return {
      value: parsed,
      valid: true,
    };
  }

  return {
    value: DEFAULT_TOP_K,
    valid: false,
  };
}

function resolveRegion(env: NodeJS.ProcessEnv): {
  region: string;
  source: ResolvedKbRagDiagnosticsConfig['regionSource'];
} {
  const bedrockRegion = trimText(env.BEDROCK_KB_REGION);
  if (bedrockRegion !== undefined) {
    return {
      region: bedrockRegion,
      source: 'BEDROCK_KB_REGION',
    };
  }

  const awsRegion = trimText(env.AWS_REGION);
  if (awsRegion !== undefined) {
    return {
      region: awsRegion,
      source: 'AWS_REGION',
    };
  }

  const awsDefaultRegion = trimText(env.AWS_DEFAULT_REGION);
  if (awsDefaultRegion !== undefined) {
    return {
      region: awsDefaultRegion,
      source: 'AWS_DEFAULT_REGION',
    };
  }

  return {
    region: DEFAULT_REGION,
    source: 'default',
  };
}

function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedKbRagDiagnosticsConfig {
  const knowledgeBaseId = trimText(env.BEDROCK_KB_ID);
  const kbRetrieveEnabled =
    parseBooleanEnv(env.ENABLE_KB_RETRIEVE_TOOL) ?? Boolean(knowledgeBaseId);
  const region = resolveRegion(env);
  const defaultTopK = parseTopK(env.BEDROCK_KB_DEFAULT_TOP_K);

  return {
    knowledgeBaseId,
    knowledgeBaseIdSource: knowledgeBaseId === undefined ? 'missing' : 'env',
    kbRetrieveEnabled,
    region: region.region,
    regionSource: region.source,
    defaultTopK: defaultTopK.value,
    defaultTopKSource: defaultTopK.valid ? 'BEDROCK_KB_DEFAULT_TOP_K' : 'default',
    defaultTopKRaw: trimText(env.BEDROCK_KB_DEFAULT_TOP_K),
    defaultTopKValid: defaultTopK.valid,
  };
}

function addCheck(
  checks: KbRagDiagnosticsCheck[],
  input: KbRagDiagnosticsCheck,
): void {
  checks.push(input);
}

function uniqueActions(actions: string[]): string[] {
  return [...new Set(actions)];
}

function aggregateStatus(checks: KbRagDiagnosticsCheck[]): KbRagDiagnosticsCheckStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }

  if (checks.some((check) => check.status === 'warn')) {
    return 'warn';
  }

  if (checks.some((check) => check.status === 'unknown')) {
    return 'unknown';
  }

  return 'pass';
}

function buildSummary(checks: KbRagDiagnosticsCheck[]): string {
  const counts = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, unknown: 0 } as Record<
      KbRagDiagnosticsCheckStatus,
      number
    >,
  );

  if (counts.fail > 0) {
    return `Diagnostics found ${counts.fail} blocking issue${counts.fail === 1 ? '' : 's'} and ${counts.warn} warning${counts.warn === 1 ? '' : 's'}.`;
  }

  if (counts.warn > 0) {
    return `Diagnostics passed with ${counts.warn} warning${counts.warn === 1 ? '' : 's'}.`;
  }

  if (counts.unknown > 0) {
    return `Diagnostics could not fully evaluate ${counts.unknown} check${counts.unknown === 1 ? '' : 's'}.`;
  }

  return 'Diagnostics passed with no warnings.';
}

function buildEnvDetails(
  includeEnvValues: boolean,
  details: Record<string, unknown>,
  envValue?: string | number | boolean | undefined,
): Record<string, unknown> {
  if (!includeEnvValues) {
    return details;
  }

  return {
    ...details,
    ...(envValue === undefined ? {} : { value: envValue }),
  };
}

export function runKbRagDiagnostics(
  input: KbRagDiagnosticsInput = {},
): KbRagDiagnosticsOutput {
  const includeEnvValues = input.includeEnvValues ?? false;
  const config = resolveConfig();
  const checks: KbRagDiagnosticsCheck[] = [];
  const nextActions: string[] = [];

  addCheck(checks, {
    id: 'kb_retrieve_tool',
    status: config.kbRetrieveEnabled ? 'pass' : 'warn',
    message: config.kbRetrieveEnabled
      ? 'KB retrieve tool is enabled.'
      : 'KB retrieve tool is disabled, so diagnostics can run safely but retrieval is unavailable.',
    details: buildEnvDetails(
      includeEnvValues,
      {
        enabled: config.kbRetrieveEnabled,
      },
      process.env.ENABLE_KB_RETRIEVE_TOOL,
    ),
  });

  if (config.knowledgeBaseId === undefined) {
    addCheck(checks, {
      id: 'knowledge_base_id',
      status: config.kbRetrieveEnabled ? 'fail' : 'warn',
      message: config.kbRetrieveEnabled
        ? 'BEDROCK_KB_ID is required when the KB retrieve tool is enabled.'
        : 'BEDROCK_KB_ID is missing, but the KB retrieve tool is disabled.',
      details: buildEnvDetails(
        includeEnvValues,
        {
          present: false,
          source: config.knowledgeBaseIdSource,
        },
        process.env.BEDROCK_KB_ID,
      ),
    });
    nextActions.push('Set BEDROCK_KB_ID before enabling KB retrieval.');
  } else {
    addCheck(checks, {
      id: 'knowledge_base_id',
      status: 'pass',
      message: 'Bedrock Knowledge Base ID is configured.',
      details: buildEnvDetails(
        includeEnvValues,
        {
          present: true,
          source: config.knowledgeBaseIdSource,
        },
        config.knowledgeBaseId,
      ),
    });
  }

  addCheck(checks, {
    id: 'region',
    status: config.regionSource === 'default' ? 'warn' : 'pass',
    message:
      config.regionSource === 'default'
        ? `No KB region env var was set, so the default region ${config.region} will be used.`
        : `Resolved KB region from ${config.regionSource} as ${config.region}.`,
    details: buildEnvDetails(
      includeEnvValues,
      {
        resolvedRegion: config.region,
        source: config.regionSource,
      },
      config.regionSource === 'BEDROCK_KB_REGION'
        ? process.env.BEDROCK_KB_REGION
        : config.regionSource === 'AWS_REGION'
          ? process.env.AWS_REGION
          : config.regionSource === 'AWS_DEFAULT_REGION'
            ? process.env.AWS_DEFAULT_REGION
            : DEFAULT_REGION,
    ),
  });

  if (config.regionSource === 'default') {
    nextActions.push('Set BEDROCK_KB_REGION or AWS_REGION to avoid the default region fallback.');
  }

  addCheck(checks, {
    id: 'default_top_k',
    status: config.defaultTopKValid ? 'pass' : 'warn',
    message: config.defaultTopKValid
      ? `BEDROCK_KB_DEFAULT_TOP_K is set to ${config.defaultTopK}.`
      : `No valid BEDROCK_KB_DEFAULT_TOP_K was found, so topK will default to ${config.defaultTopK}.`,
    details: buildEnvDetails(
      includeEnvValues,
      {
        resolvedTopK: config.defaultTopK,
        source: config.defaultTopKSource,
      },
      config.defaultTopKSource === 'BEDROCK_KB_DEFAULT_TOP_K'
        ? config.defaultTopKRaw
        : config.defaultTopK,
    ),
  });

  if (!config.defaultTopKValid) {
    nextActions.push(
      `Set BEDROCK_KB_DEFAULT_TOP_K if you want a non-default topK; otherwise ${DEFAULT_TOP_K} will be assumed.`,
    );
  }

  const status = aggregateStatus(checks);

  if (status === 'pass') {
    nextActions.push('KB retrieval is configured enough for the next safe retrieval step.');
  } else if (status === 'warn') {
    nextActions.push('Address warnings before relying on KB retrieval for production use.');
  } else if (status === 'fail') {
    nextActions.push('Fix the blocking KB retrieve configuration issues before running retrieval.');
  }

  return {
    status,
    checks,
    summary: buildSummary(checks),
    nextActions: uniqueActions(nextActions),
    metadata: {
      ...input.metadata,
      diagnostics: DIAGNOSTICS_MARKER,
      kbRetrieveEnabled: config.kbRetrieveEnabled,
      regionSource: config.regionSource,
      defaultTopKSource: config.defaultTopKSource,
      ...(includeEnvValues
        ? {
            env: {
              BEDROCK_KB_ID: config.knowledgeBaseId,
              BEDROCK_KB_REGION:
                config.regionSource === 'BEDROCK_KB_REGION' ? config.region : undefined,
              AWS_REGION: config.regionSource === 'AWS_REGION' ? config.region : undefined,
              AWS_DEFAULT_REGION:
                config.regionSource === 'AWS_DEFAULT_REGION' ? config.region : undefined,
              ENABLE_KB_RETRIEVE_TOOL: process.env.ENABLE_KB_RETRIEVE_TOOL,
              BEDROCK_KB_DEFAULT_TOP_K: config.defaultTopKRaw,
            },
          }
        : {}),
    },
  };
}

import type { BedrockKbStructuredExecutionMode } from './bedrock-kb-structured-types.js';

export type BedrockKbStructuredRuntimeConfig = {
  knowledgeBaseId?: string | undefined;
  region: string;
  dataSourceName?: string | undefined;
  mode: BedrockKbStructuredExecutionMode;
  liveEnabled: boolean;
  redshiftServerlessWorkgroupName?: string | undefined;
  redshiftDatabaseName?: string | undefined;
};

function trimEnv(value: string | undefined): string | undefined {
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

function parseModeEnv(
  value: string | undefined,
): BedrockKbStructuredExecutionMode | undefined {
  const normalized = value?.trim();
  if (normalized === 'stub' || normalized === 'dry_run' || normalized === 'live') {
    return normalized;
  }

  return undefined;
}

export function resolveBedrockKbStructuredRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BedrockKbStructuredRuntimeConfig {
  return {
    knowledgeBaseId: trimEnv(env.BEDROCK_KB_STRUCTURED_ID),
    region:
      trimEnv(env.BEDROCK_KB_STRUCTURED_REGION) ??
      trimEnv(env.AWS_REGION) ??
      trimEnv(env.AWS_DEFAULT_REGION) ??
      'us-east-1',
    dataSourceName: trimEnv(env.BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME),
    mode: parseModeEnv(env.BEDROCK_KB_STRUCTURED_MODE) ?? 'stub',
    liveEnabled: parseBooleanEnv(env.ENABLE_BEDROCK_KB_STRUCTURED_LIVE) ?? false,
    redshiftServerlessWorkgroupName: trimEnv(env.REDSHIFT_SERVERLESS_WORKGROUP_NAME),
    redshiftDatabaseName: trimEnv(env.REDSHIFT_DATABASE_NAME),
  };
}

export function isBedrockKbStructuredLiveReady(
  config: BedrockKbStructuredRuntimeConfig,
): boolean {
  return (
    config.mode === 'live' &&
    config.liveEnabled &&
    config.knowledgeBaseId !== undefined &&
    config.redshiftServerlessWorkgroupName !== undefined &&
    config.redshiftDatabaseName !== undefined
  );
}

export function describeBedrockKbStructuredLiveBlocker(
  config: BedrockKbStructuredRuntimeConfig,
): string | undefined {
  if (config.mode !== 'live') {
    return undefined;
  }

  if (!config.liveEnabled) {
    return 'Bedrock KB structured live execution is disabled.';
  }

  if (config.knowledgeBaseId === undefined) {
    return 'BEDROCK_KB_STRUCTURED_ID is required for Bedrock KB structured live execution.';
  }

  if (config.redshiftServerlessWorkgroupName === undefined) {
    return 'REDSHIFT_SERVERLESS_WORKGROUP_NAME is required for Bedrock KB structured live execution.';
  }

  if (config.redshiftDatabaseName === undefined) {
    return 'REDSHIFT_DATABASE_NAME is required for Bedrock KB structured live execution.';
  }

  return undefined;
}

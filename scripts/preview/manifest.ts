/**
 * Pure builders for preview plan, manifest, and env-file artifacts.
 *
 * No AWS, filesystem, or process access. `normalizeOutputs` maps raw CDK
 * CfnOutput keys to stable manifest keys and includes only keys that are
 * actually present, so missing CDK outputs never produce invented values.
 */
import type { PreviewConfig } from './preview-stage.js';

/** Caller identity resolved from AWS STS (see assert-aws-identity.ts). */
export interface AwsIdentity {
  accountId: string;
  region: string;
  arn: string;
}

/** Raw shape of a CDK `--outputs-file`: stackName -> { OutputKey: value }. */
export type CdkOutputs = Record<string, Record<string, string>>;

/** Stable, normalized output keys surfaced in the manifest and env files. */
export type NormalizedOutputs = Record<string, string>;

export interface PreviewPlan {
  project: 'Agentra';
  environmentType: 'preview';
  stage: string;
  profile: string;
  createdAt: string;
  expiresAt: string;
  accountId: string | null;
  region: string | null;
  stackPrefix: string;
  stacks: string[];
  tags: Record<string, string>;
}

export interface PreviewManifest {
  project: 'Agentra';
  environmentType: 'preview';
  stage: string;
  profile: string;
  owner: string;
  source: string;
  createdAt: string;
  expiresAt: string;
  accountId: string | null;
  region: string | null;
  stacks: string[];
  tags: Record<string, string>;
  outputs: NormalizedOutputs;
}

/** CfnOutput key -> normalized manifest key. Only mapped keys are surfaced. */
const OUTPUT_KEY_MAP: Readonly<Record<string, string>> = {
  HttpApiUrl: 'bffApiUrl',
  StreamingApiUrl: 'streamingApiUrl',
  UserPoolId: 'userPoolId',
  UserPoolClientId: 'userPoolClientId',
  CognitoDomain: 'cognitoDomain',
  PresentationArtifactsBucketName: 'artifactBucketName',
  AgentCoreRuntimeArn: 'agentCoreRuntimeArn',
  AgentCoreLogGroupNames: 'agentCoreLogGroupNames',
};

/** Ordered `[envVar, normalizedKey]` mappings for generated env files. */
const BACKEND_ENV_MAP: ReadonlyArray<readonly [string, string]> = [
  ['AGENTRA_API_BASE_URL', 'bffApiUrl'],
  ['AGENTRA_STREAMING_API_BASE_URL', 'streamingApiUrl'],
  ['COGNITO_USER_POOL_ID', 'userPoolId'],
  ['COGNITO_USER_POOL_CLIENT_ID', 'userPoolClientId'],
];

const FRONTEND_ENV_MAP: ReadonlyArray<readonly [string, string]> = [
  ['NEXT_PUBLIC_API_BASE_URL', 'bffApiUrl'],
  ['NEXT_PUBLIC_STREAMING_API_BASE_URL', 'streamingApiUrl'],
  ['NEXT_PUBLIC_COGNITO_USER_POOL_ID', 'userPoolId'],
  ['NEXT_PUBLIC_COGNITO_CLIENT_ID', 'userPoolClientId'],
  ['NEXT_PUBLIC_COGNITO_DOMAIN', 'cognitoDomain'],
];

export function buildPlan(
  config: PreviewConfig,
  identity: AwsIdentity | null,
  stacks: readonly string[],
): PreviewPlan {
  return {
    project: 'Agentra',
    environmentType: 'preview',
    stage: config.stage,
    profile: config.profile,
    createdAt: config.createdAt,
    expiresAt: config.expiresAt,
    accountId: identity?.accountId ?? null,
    region: identity?.region ?? null,
    stackPrefix: config.stackPrefix,
    stacks: [...stacks],
    tags: { ...config.tags },
  };
}

export function buildManifest(
  config: PreviewConfig,
  identity: AwsIdentity | null,
  stacks: readonly string[],
  outputs: NormalizedOutputs,
): PreviewManifest {
  return {
    project: 'Agentra',
    environmentType: 'preview',
    stage: config.stage,
    profile: config.profile,
    owner: config.owner,
    source: config.source,
    createdAt: config.createdAt,
    expiresAt: config.expiresAt,
    accountId: identity?.accountId ?? null,
    region: identity?.region ?? null,
    stacks: [...stacks],
    tags: { ...config.tags },
    outputs: { ...outputs },
  };
}

/**
 * Flatten a CDK outputs file into normalized keys, including only outputs that
 * are present and non-empty. Unknown CfnOutput keys are ignored; missing ones
 * are omitted entirely (never emitted as empty strings or placeholders).
 */
export function normalizeOutputs(cdkOutputs: CdkOutputs): NormalizedOutputs {
  const normalized: NormalizedOutputs = {};
  for (const stackOutputs of Object.values(cdkOutputs)) {
    if (stackOutputs === null || typeof stackOutputs !== 'object') {
      continue;
    }
    for (const [cfnKey, normalizedKey] of Object.entries(OUTPUT_KEY_MAP)) {
      const value = stackOutputs[cfnKey];
      if (typeof value === 'string' && value.length > 0) {
        normalized[normalizedKey] = value;
      }
    }
  }
  return normalized;
}

function buildEnvFile(
  mapping: ReadonlyArray<readonly [string, string]>,
  outputs: NormalizedOutputs,
): string {
  const lines = mapping
    .filter(([, key]) => typeof outputs[key] === 'string' && outputs[key].length > 0)
    .map(([envVar, key]) => `${envVar}=${outputs[key]}`);
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export function buildBackendEnv(outputs: NormalizedOutputs): string {
  return buildEnvFile(BACKEND_ENV_MAP, outputs);
}

export function buildFrontendEnv(outputs: NormalizedOutputs): string {
  return buildEnvFile(FRONTEND_ENV_MAP, outputs);
}

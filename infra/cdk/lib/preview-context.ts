/**
 * Preview environment wiring for the CDK app.
 *
 * Adds an explicit `environmentType=preview` path on top of the existing
 * `environmentKind` flow. Preview infrastructure is validated by the guardrail
 * library (scripts/preview), named under the unambiguous `AgentraPreview-<stage>-*`
 * prefix, profile-gated, tagged, and given destroy-oriented removal policies via
 * the existing `ephemeral` environment kind. Non-preview behavior is untouched.
 *
 * Safety boundary: stack NAMING (CloudFormation stack name carries the
 * `AgentraPreview-<stage>-` prefix) plus required tags. Tags alone are never the
 * only safety mechanism.
 */
import type { App, StackProps } from 'aws-cdk-lib';
import { Stack, Tags } from 'aws-cdk-lib';
import {
  type PreviewConfig,
  resolvePreviewConfig,
} from '../../../scripts/preview/preview-stage.js';
import { AgentraAgentCoreRuntimeStack } from './agentra-agentcore-runtime-stack.js';
import { AgentraAgentCoreStack } from './agentra-agentcore-stack.js';
import { AgentraAppStack } from './agentra-app-stack.js';
import { AgentraBedrockKbStack } from './agentra-bedrock-kb-stack.js';
import { AgentraDataAuthStack } from './agentra-data-auth-stack.js';
import { AgentraSlideRuntimeStack } from './agentra-slide-runtime-stack.js';
import { AgentraWebHostingStack } from './agentra-web-hosting-stack.js';
import type { EnvironmentKind } from './environment.js';

/** Preview stacks run as `ephemeral`: RemovalPolicy.DESTROY + autoDeleteObjects. */
const PREVIEW_ENVIRONMENT_KIND: EnvironmentKind = 'ephemeral';

/** Slide/agentcore runtimes are pinned to the `prod` qualifier (mirrors the default app). */
const RUNTIME_QUALIFIER = 'prod';

/**
 * Upper bound on preview stage length at the CDK layer.
 *
 * `<stage>` is embedded in resource names such as the Cognito domain prefix
 * `agentra-<stage>-auth` and the KB bucket `agentra-<stage>-manufacturing-docs`
 * (S3 bucket names cap at 63 chars: 8 + stage + 20 <= 63 => stage <= 35). The
 * guardrail library validates the stage *pattern* but does not cap length, so we
 * enforce a conservative limit here. Keep below the binding bucket-name limit.
 */
const MAX_PREVIEW_STAGE_LENGTH = 32;

/** Localhost callback/logout/CORS defaults for preview smoke (overridable via context). */
const DEFAULT_LOCAL_CALLBACK_URLS = ['http://localhost:3000/', 'http://127.0.0.1:3000/'];
const DEFAULT_LOCAL_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/** Logical stacks that can be synthesized for a preview environment. */
export type PreviewStackKey =
  | 'dataAuth'
  | 'app'
  | 'agentCore'
  | 'agentCoreRuntime'
  | 'knowledgeBase'
  | 'slideRuntime'
  | 'webHosting';

/** CloudFormation name suffix for each logical stack (`AgentraPreview-<stage>-<suffix>`). */
const STACK_NAME_SUFFIX: Record<PreviewStackKey, string> = {
  dataAuth: 'DataAuth',
  app: 'Backend',
  agentCore: 'AgentCore',
  agentCoreRuntime: 'AgentCoreRuntime',
  knowledgeBase: 'KnowledgeBase',
  slideRuntime: 'SlideRuntime',
  webHosting: 'Frontend',
};

/**
 * Stacks synthesized per profile. `minimal-api` brings up only the BFF/API path
 * (DataAuth + Backend) and avoids the AI/runtime Docker image assets and KB/vector
 * resources. `backend-ai` adds the AI runtime + KB. `full` adds frontend hosting.
 */
const PROFILE_STACKS: Record<PreviewConfig['profile'], readonly PreviewStackKey[]> = {
  'minimal-api': ['dataAuth', 'app'],
  'backend-ai': [
    'dataAuth',
    'app',
    'agentCore',
    'agentCoreRuntime',
    'knowledgeBase',
    'slideRuntime',
  ],
  full: [
    'dataAuth',
    'app',
    'agentCore',
    'agentCoreRuntime',
    'knowledgeBase',
    'slideRuntime',
    'webHosting',
  ],
};

export interface PreviewCdkContext {
  readonly config: PreviewConfig;
  readonly environmentKind: EnvironmentKind;
  readonly enabledStacks: ReadonlySet<PreviewStackKey>;
  readonly tags: Readonly<Record<string, string>>;
  readonly callbackUrls: string[];
  readonly logoutUrls: string[];
  readonly corsOrigins: string[];
  readonly thirdPartyApiKeysSecretArn?: string;
  readonly deckPreviewEnabled: boolean;
}

function readContextString(app: App, key: string): string | undefined {
  const value = app.node.tryGetContext(key);
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readCsvContext(app: App, key: string): string[] {
  const value = readContextString(app, key);
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readTtlHours(app: App): number | undefined {
  const raw = readContextString(app, 'ttlHours');
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ttlHours "${raw}": expected a number.`);
  }
  return parsed;
}

function assertPreviewStageLength(stage: string): void {
  if (stage.length > MAX_PREVIEW_STAGE_LENGTH) {
    throw new Error(
      `Invalid preview stage "${stage}": length ${stage.length} exceeds maximum ` +
        `${MAX_PREVIEW_STAGE_LENGTH}. Stage names feed resource names such as the Cognito ` +
        'domain prefix and S3 bucket names; keep preview stages short.',
    );
  }
}

function buildPreviewTags(
  config: PreviewConfig,
  extras: Record<string, string | undefined>,
): Readonly<Record<string, string>> {
  const tags: Record<string, string> = {
    ...config.tags,
    PreviewProfile: config.profile,
  };
  for (const [key, value] of Object.entries(extras)) {
    if (value) {
      tags[key] = value;
    }
  }
  return Object.freeze(tags);
}

/**
 * Resolves preview CDK context from `cdk.App` context, or returns `null` when
 * `environmentType` is not `preview` (so the default environmentKind path runs).
 *
 * Throws (fails synth) on forbidden stage names, over-length stages, or invalid
 * profile/source/TTL values.
 */
export function resolvePreviewCdkContext(app: App): PreviewCdkContext | null {
  const environmentType = readContextString(app, 'environmentType');
  // Distinguish "key omitted" (standard path) from a typo'd value. A typo such as
  // `environmentType=Preview` must fail fast rather than silently fall back to the
  // standard path, where a `pr-123` stage would synth as a non-isolated stack name.
  if (environmentType === undefined) {
    return null;
  }
  if (environmentType !== 'preview') {
    throw new Error(
      `Invalid environmentType "${environmentType}". ` +
        'Expected "preview", or omit the key for standard environments.',
    );
  }

  const stage = readContextString(app, 'stage');
  if (stage === undefined) {
    throw new Error('Preview synth requires -c stage=<preview-stage>.');
  }
  assertPreviewStageLength(stage);

  const previewProfile = readContextString(app, 'previewProfile');
  const owner = readContextString(app, 'owner');
  const source = readContextString(app, 'source');
  const ttlHours = readTtlHours(app);

  // resolvePreviewConfig validates the stage pattern, profile, source, and TTL.
  const config = resolvePreviewConfig({
    stage,
    ...(previewProfile ? { profile: previewProfile } : {}),
    ...(owner ? { owner } : {}),
    ...(source ? { source } : {}),
    ...(ttlHours !== undefined ? { ttlHours } : {}),
  });

  const tags = buildPreviewTags(config, {
    PullRequest: readContextString(app, 'pullRequest'),
    Branch: readContextString(app, 'branch'),
    CommitSha: readContextString(app, 'commitSha'),
  });

  const callbackUrls = readCsvContext(app, 'callbackUrls');
  const logoutUrls = readCsvContext(app, 'logoutUrls');
  const corsOrigins = readCsvContext(app, 'corsOrigins');
  const thirdPartyApiKeysSecretArn = readContextString(app, 'thirdPartyApiKeysSecretArn');
  const deckPreviewCtx = app.node.tryGetContext('deckPreviewEnabled');
  const deckPreviewEnabled = deckPreviewCtx === true || deckPreviewCtx === 'true';

  return {
    config,
    environmentKind: PREVIEW_ENVIRONMENT_KIND,
    enabledStacks: new Set(PROFILE_STACKS[config.profile]),
    tags,
    callbackUrls: callbackUrls.length > 0 ? callbackUrls : DEFAULT_LOCAL_CALLBACK_URLS,
    logoutUrls: logoutUrls.length > 0 ? logoutUrls : DEFAULT_LOCAL_CALLBACK_URLS,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : DEFAULT_LOCAL_CORS_ORIGINS,
    ...(thirdPartyApiKeysSecretArn ? { thirdPartyApiKeysSecretArn } : {}),
    deckPreviewEnabled,
  };
}

/**
 * Instantiates the profile's preview stacks under `AgentraPreview-<stage>-*`,
 * applies the required tags to each stack explicitly, and wires dependencies.
 *
 * Both the construct id and the CloudFormation `stackName` are set to the
 * prefixed name so the safety prefix survives into the synthesized template.
 */
export function addPreviewStacks(app: App, context: PreviewCdkContext): void {
  const { config, environmentKind, enabledStacks } = context;

  const stackName = (key: PreviewStackKey): string =>
    `${config.stackPrefix}-${STACK_NAME_SUFFIX[key]}`;

  const sharedProps = (key: PreviewStackKey): StackProps => ({
    stackName: stackName(key),
    description: `Agentra preview ${config.stage} ${STACK_NAME_SUFFIX[key]} stack (profile=${config.profile}).`,
  });

  // DataAuth and Backend are present in every profile.
  const dataAuthStack = new AgentraDataAuthStack(app, stackName('dataAuth'), {
    ...sharedProps('dataAuth'),
    stage: config.stage,
    environmentKind,
    cognitoDomainPrefix: `agentra-${config.stage}-auth`,
    callbackUrls: context.callbackUrls,
    logoutUrls: context.logoutUrls,
  });

  let agentCoreRuntimeArn: string | undefined;
  let slideRuntimeArn: string | undefined;
  let presentationArtifactsBucketName: string | undefined;
  let normalKbId: string | undefined;
  let normalKbArn: string | undefined;
  let normalKbDataSourceId: string | undefined;
  let kbDataSourceBucketName: string | undefined;

  const dependencies: Stack[] = [dataAuthStack];

  if (enabledStacks.has('agentCore')) {
    new AgentraAgentCoreStack(app, stackName('agentCore'), {
      ...sharedProps('agentCore'),
      stage: config.stage,
    });
  }

  if (enabledStacks.has('slideRuntime')) {
    const slideRuntimeStack = new AgentraSlideRuntimeStack(
      app,
      stackName('slideRuntime'),
      {
        ...sharedProps('slideRuntime'),
        stage: config.stage,
        environmentKind,
        deckPreviewEnabled: context.deckPreviewEnabled,
        ...(context.thirdPartyApiKeysSecretArn
          ? { thirdPartyApiKeysSecretArn: context.thirdPartyApiKeysSecretArn }
          : {}),
      },
    );
    slideRuntimeArn = slideRuntimeStack.runtimeArn;
    presentationArtifactsBucketName = slideRuntimeStack.artifactsBucketName;
    dependencies.push(slideRuntimeStack);
  }

  if (enabledStacks.has('knowledgeBase')) {
    const bedrockKbStack = new AgentraBedrockKbStack(app, stackName('knowledgeBase'), {
      ...sharedProps('knowledgeBase'),
      stage: config.stage,
      environmentKind,
      allowedCorsOrigins: context.corsOrigins,
    });
    normalKbId = bedrockKbStack.knowledgeBaseId;
    normalKbArn = bedrockKbStack.knowledgeBaseArn;
    normalKbDataSourceId = bedrockKbStack.dataSourceId;
    kbDataSourceBucketName = bedrockKbStack.documentBucketName;
    dependencies.push(bedrockKbStack);
  }

  if (enabledStacks.has('agentCoreRuntime')) {
    const agentCoreRuntimeStack = new AgentraAgentCoreRuntimeStack(
      app,
      stackName('agentCoreRuntime'),
      {
        ...sharedProps('agentCoreRuntime'),
        stage: config.stage,
        environmentKind,
        ...(slideRuntimeArn
          ? { slideRuntimeArn, slideRuntimeQualifier: RUNTIME_QUALIFIER }
          : {}),
        ...(context.thirdPartyApiKeysSecretArn
          ? { thirdPartyApiKeysSecretArn: context.thirdPartyApiKeysSecretArn }
          : {}),
        // Preview keeps AgentCore minimal for smoke: no session-memory S3 bucket.
        memoryEnabled: false,
        ...(normalKbArn ? { normalKbArn } : {}),
        ...(normalKbId ? { normalKbId } : {}),
      },
    );
    agentCoreRuntimeArn = agentCoreRuntimeStack.runtimeArn;
    dependencies.push(agentCoreRuntimeStack);
  }

  const appStack = new AgentraAppStack(app, stackName('app'), {
    ...sharedProps('app'),
    dataAuthStack,
    ...(agentCoreRuntimeArn
      ? { agentCoreRuntimeArn, agentCoreRuntimeQualifier: RUNTIME_QUALIFIER }
      : {}),
    ...(slideRuntimeArn
      ? { slideRuntimeArn, slideRuntimeQualifier: RUNTIME_QUALIFIER }
      : {}),
    ...(presentationArtifactsBucketName ? { presentationArtifactsBucketName } : {}),
    allowedCorsOrigins: context.corsOrigins,
    ...(normalKbId ? { normalKbId } : {}),
    ...(normalKbArn ? { normalKbArn } : {}),
    ...(normalKbDataSourceId ? { normalKbDataSourceId } : {}),
    ...(kbDataSourceBucketName ? { kbDataSourceBucketName } : {}),
  });
  for (const dependency of dependencies) {
    appStack.addDependency(dependency);
  }

  if (enabledStacks.has('webHosting')) {
    const webHostingStack = new AgentraWebHostingStack(app, stackName('webHosting'), {
      ...sharedProps('webHosting'),
      appStack,
      dataAuthStack,
      stage: config.stage,
    });
    webHostingStack.addDependency(appStack);
    webHostingStack.addDependency(dataAuthStack);
  }

  // Required tags: apply to every preview stack explicitly (not only at app scope).
  for (const stack of app.node.children) {
    if (Stack.isStack(stack)) {
      applyPreviewTags(stack, context.tags);
    }
  }
}

function applyPreviewTags(stack: Stack, tags: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(tags)) {
    Tags.of(stack).add(key, value);
  }
}

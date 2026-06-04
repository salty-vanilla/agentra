#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentraAgentCoreRuntimeStack } from '../lib/agentra-agentcore-runtime-stack.js';
import { AgentraAgentCoreStack } from '../lib/agentra-agentcore-stack.js';
import { AgentraAppStack } from '../lib/agentra-app-stack.js';
import { AgentraBedrockKbStack } from '../lib/agentra-bedrock-kb-stack.js';
import { AgentraDataAuthStack } from '../lib/agentra-data-auth-stack.js';
import { AgentraSlideRuntimeStack } from '../lib/agentra-slide-runtime-stack.js';
import { AgentraWebHostingStack } from '../lib/agentra-web-hosting-stack.js';
import {
  deriveEnvironmentKind,
  type EnvironmentKind,
  validateEnvironmentKind,
} from '../lib/environment.js';
import { addPreviewStacks, resolvePreviewCdkContext } from '../lib/preview-context.js';

// Matches scripts/agent/cdk-stage.sh::validate_stage.
// Lowercase alphanumeric and hyphens; may not start or end with a hyphen.
const STAGE_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_STAGE_LENGTH = 16;

function validateStage(stage: string): void {
  if (!STAGE_PATTERN.test(stage)) {
    throw new Error(
      `Invalid stage "${stage}": must contain only lowercase letters, numbers, and hyphens, ` +
        'and may not start or end with a hyphen. Examples: "dev", "prod", "staging-v2", "i252-env-kind"',
    );
  }
  if (stage.length > MAX_STAGE_LENGTH) {
    throw new Error(
      `Invalid stage "${stage}": length ${stage.length} exceeds maximum ${MAX_STAGE_LENGTH}. ` +
        'Keep stage names short (e.g., "dev", "prod") to avoid collision in resource names.',
    );
  }
}

const app = new cdk.App();

// Preview environments (environmentType=preview) take a fully isolated path:
// guardrail-validated stage, AgentraPreview-<stage>-* stack names, profile gating,
// and required tags. When not preview, the existing environmentKind flow runs
// unchanged.
const previewContext = resolvePreviewCdkContext(app);
if (previewContext) {
  addPreviewStacks(app, previewContext);
} else {
  const stage = (app.node.tryGetContext('stage') as string | undefined)?.trim() || 'dev';
  const stageLabel = stage.toLowerCase();
  validateStage(stageLabel);

  // environmentKind drives RemovalPolicy and lifecycle duration, independent of stage name.
  // Explicit values are validated and fail fast on typos; omitting auto-derives from stage.
  const rawEnvironmentKind = (
    app.node.tryGetContext('environmentKind') as string | undefined
  )?.trim();
  if (rawEnvironmentKind) {
    validateEnvironmentKind(rawEnvironmentKind);
  }
  const environmentKind: EnvironmentKind = rawEnvironmentKind
    ? (rawEnvironmentKind as EnvironmentKind)
    : deriveEnvironmentKind(stageLabel);

  const thirdPartyApiKeysSecretArn = (
    app.node.tryGetContext('thirdPartyApiKeysSecretArn') as string | undefined
  )?.trim();

  // Opt-in deck Live Preview (issue #412). Default off; enable per ephemeral env
  // with `-c deckPreviewEnabled=true`.
  const deckPreviewEnabledCtx = app.node.tryGetContext('deckPreviewEnabled');
  const deckPreviewEnabled =
    deckPreviewEnabledCtx === true || deckPreviewEnabledCtx === 'true';
  // Optional: slow the Streaming Deck Preview replay so the reveal is more
  // visible (dogfood/demo). `-c deckPreviewPacingMs=2500`. Default 200 in runtime.
  const deckPreviewPacingCtx = app.node.tryGetContext('deckPreviewPacingMs');
  const deckPreviewReplayPacingMs =
    typeof deckPreviewPacingCtx === 'string' && deckPreviewPacingCtx.trim().length > 0
      ? deckPreviewPacingCtx.trim()
      : undefined;

  // Opt-in true per-slide streaming (Epic #417: #419 per-slide pipeline,
  // #420 slide-runtime SSE, #421 router relay). Default off — Route A replay.
  const boolCtx = (key: string): boolean => {
    const value = app.node.tryGetContext(key);
    return value === true || value === 'true';
  };
  const slideRuntimeStreaming = boolCtx('slideRuntimeStreaming');
  const deckPreviewStreaming = boolCtx('deckPreviewStreaming');
  const routerDeckStreaming = boolCtx('routerDeckStreaming');

  const parseCsvContext = (key: string): string[] => {
    const value = app.node.tryGetContext(key);
    if (!value || typeof value !== 'string') {
      return [];
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const defaultLocalUrls = ['http://localhost:3000/', 'http://127.0.0.1:3000/'];
  const callbackUrls = parseCsvContext('callbackUrls');
  const logoutUrls = parseCsvContext('logoutUrls');
  const corsOrigins = parseCsvContext('corsOrigins');

  // Use localhost defaults for local development environments (shared-dev or local kind).
  const usesLocalDefaults =
    environmentKind === 'shared-dev' || environmentKind === 'local';
  const resolvedCallbackUrls =
    callbackUrls.length > 0 ? callbackUrls : usesLocalDefaults ? defaultLocalUrls : [];
  const resolvedLogoutUrls =
    logoutUrls.length > 0 ? logoutUrls : usesLocalDefaults ? defaultLocalUrls : [];
  const resolvedCorsOrigins =
    corsOrigins.length > 0
      ? corsOrigins
      : usesLocalDefaults
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : [];

  if (
    resolvedCallbackUrls.length === 0 ||
    resolvedLogoutUrls.length === 0 ||
    resolvedCorsOrigins.length === 0
  ) {
    throw new Error(
      `Missing URLs for stage="${stageLabel}" (environmentKind="${environmentKind}"). ` +
        'Provide all of -c callbackUrls=... -c logoutUrls=... -c corsOrigins=...',
    );
  }

  const dataAuthStack = new AgentraDataAuthStack(
    app,
    `AgentraDataAuthStack-${stageLabel}`,
    {
      description: `Agentra ${stageLabel} data/auth stack (Cognito and DynamoDB).`,
      stage: stageLabel,
      environmentKind,
      cognitoDomainPrefix: `agentra-${stageLabel}-auth`,
      callbackUrls: resolvedCallbackUrls,
      logoutUrls: resolvedLogoutUrls,
    },
  );

  new AgentraAgentCoreStack(app, `AgentraAgentCoreStack-${stageLabel}`, {
    description: `Agentra ${stageLabel} AgentCore stack (gateway foundation).`,
    stage: stageLabel,
  });

  const slideRuntimeStack = new AgentraSlideRuntimeStack(
    app,
    `AgentraSlideRuntimeStack-${stageLabel}`,
    {
      description: `Agentra ${stageLabel} slide generation runtime stack.`,
      stage: stageLabel,
      environmentKind,
      deckPreviewEnabled,
      slideRuntimeStreaming,
      deckPreviewStreaming,
      ...(thirdPartyApiKeysSecretArn ? { thirdPartyApiKeysSecretArn } : {}),
    },
  );

  const bedrockKbStack = new AgentraBedrockKbStack(
    app,
    `AgentraBedrockKbStack-${stageLabel}`,
    {
      description: `Agentra ${stageLabel} Bedrock Knowledge Base stack (normal document RAG for manufacturing line).`,
      stage: stageLabel,
      environmentKind,
      allowedCorsOrigins: resolvedCorsOrigins,
    },
  );

  const agentCoreRuntimeStack = new AgentraAgentCoreRuntimeStack(
    app,
    `AgentraAgentCoreRuntimeStack-${stageLabel}`,
    {
      description: `Agentra ${stageLabel} AgentCore runtime stack (TypeScript runtime and endpoint).`,
      stage: stageLabel,
      environmentKind,
      slideRuntimeArn: slideRuntimeStack.runtimeArn,
      slideRuntimeQualifier: 'prod',
      ...(thirdPartyApiKeysSecretArn ? { thirdPartyApiKeysSecretArn } : {}),
      memoryEnabled: true,
      normalKbArn: bedrockKbStack.knowledgeBaseArn,
      normalKbId: bedrockKbStack.knowledgeBaseId,
      ...(deckPreviewReplayPacingMs ? { deckPreviewReplayPacingMs } : {}),
      routerDeckStreaming,
    },
  );
  agentCoreRuntimeStack.addDependency(slideRuntimeStack);
  agentCoreRuntimeStack.addDependency(bedrockKbStack);

  const appStack = new AgentraAppStack(app, `AgentraAppStack-${stageLabel}`, {
    description: `Agentra ${stageLabel} backend application stack (Lambda and REST API).`,
    dataAuthStack,
    agentCoreRuntimeArn: agentCoreRuntimeStack.runtimeArn,
    agentCoreRuntimeQualifier: 'prod',
    slideRuntimeArn: slideRuntimeStack.runtimeArn,
    slideRuntimeQualifier: 'prod',
    presentationArtifactsBucketName: slideRuntimeStack.artifactsBucketName,
    allowedCorsOrigins: resolvedCorsOrigins,
    normalKbId: bedrockKbStack.knowledgeBaseId,
    normalKbArn: bedrockKbStack.knowledgeBaseArn,
    normalKbDataSourceId: bedrockKbStack.dataSourceId,
    kbDataSourceBucketName: bedrockKbStack.documentBucketName,
  });
  appStack.addDependency(dataAuthStack);
  appStack.addDependency(agentCoreRuntimeStack);
  appStack.addDependency(slideRuntimeStack);
  appStack.addDependency(bedrockKbStack);

  const webHostingStack = new AgentraWebHostingStack(
    app,
    `AgentraWebHostingStack-${stageLabel}`,
    {
      description: `Agentra ${stageLabel} web hosting stack (Amplify Hosting).`,
      appStack,
      dataAuthStack,
      stage: stageLabel,
    },
  );
  webHostingStack.addDependency(appStack);
  webHostingStack.addDependency(dataAuthStack);
}

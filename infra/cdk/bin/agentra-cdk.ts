#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentraAgentCoreRuntimeStack } from '../lib/agentra-agentcore-runtime-stack.js';
import { AgentraAgentCoreStack } from '../lib/agentra-agentcore-stack.js';
import { AgentraAppStack } from '../lib/agentra-app-stack.js';
import { AgentraDataAuthStack } from '../lib/agentra-data-auth-stack.js';
import { AgentraDeckForgeRuntimeStack } from '../lib/agentra-deck-forge-runtime-stack.js';
import { AgentraWebHostingStack } from '../lib/agentra-web-hosting-stack.js';

const app = new cdk.App();
const stage = (app.node.tryGetContext('stage') as string | undefined)?.trim() || 'dev';
const stageLabel = stage.toLowerCase();

function parseCsvContext(key: string): string[] {
  const value = app.node.tryGetContext(key);
  if (!value || typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const defaultLocalUrls = ['http://localhost:3000/', 'http://127.0.0.1:3000/'];
const callbackUrls = parseCsvContext('callbackUrls');
const logoutUrls = parseCsvContext('logoutUrls');
const corsOrigins = parseCsvContext('corsOrigins');

const resolvedCallbackUrls =
  callbackUrls.length > 0 ? callbackUrls : stageLabel === 'dev' ? defaultLocalUrls : [];
const resolvedLogoutUrls =
  logoutUrls.length > 0 ? logoutUrls : stageLabel === 'dev' ? defaultLocalUrls : [];
const resolvedCorsOrigins =
  corsOrigins.length > 0
    ? corsOrigins
    : stageLabel === 'dev'
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : [];

if (
  resolvedCallbackUrls.length === 0 ||
  resolvedLogoutUrls.length === 0 ||
  resolvedCorsOrigins.length === 0
) {
  throw new Error(
    `Missing URLs for stage="${stageLabel}". Provide all of -c callbackUrls=... -c logoutUrls=... -c corsOrigins=...`,
  );
}

const dataAuthStack = new AgentraDataAuthStack(
  app,
  `AgentraDataAuthStack-${stageLabel}`,
  {
    description: `Agentra ${stageLabel} data/auth stack (Cognito and DynamoDB).`,
    cognitoDomainPrefix: `agentra-${stageLabel}-auth`,
    callbackUrls: resolvedCallbackUrls,
    logoutUrls: resolvedLogoutUrls,
  },
);

new AgentraAgentCoreStack(app, `AgentraAgentCoreStack-${stageLabel}`, {
  description: `Agentra ${stageLabel} AgentCore stack (gateway foundation).`,
  stage: stageLabel,
});

const deckForgeRuntimeStack = new AgentraDeckForgeRuntimeStack(
  app,
  `AgentraDeckForgeRuntimeStack-${stageLabel}`,
  {
    description: `Agentra ${stageLabel} Deck Forge runtime stack.`,
    stage: stageLabel,
    bedrockImageModelId:
      (
        app.node.tryGetContext('deckForgeBedrockImageModelId') as string | undefined
      )?.trim() || 'amazon.nova-canvas-v1:0',
    bedrockTextModelId:
      (
        app.node.tryGetContext('deckForgeBedrockTextModelId') as string | undefined
      )?.trim() || 'global.anthropic.claude-sonnet-4-6',
    artifactPrefix:
      (app.node.tryGetContext('deckForgeArtifactPrefix') as string | undefined)?.trim() ||
      'deck-forge/',
  },
);

const agentCoreRuntimeStack = new AgentraAgentCoreRuntimeStack(
  app,
  `AgentraAgentCoreRuntimeStack-${stageLabel}`,
  {
    description: `Agentra ${stageLabel} AgentCore runtime stack (TypeScript runtime and endpoint).`,
    stage: stageLabel,
    deckForgeRuntimeArn: deckForgeRuntimeStack.runtimeArn,
    deckForgeRuntimeQualifier: 'prod',
  },
);
agentCoreRuntimeStack.addDependency(deckForgeRuntimeStack);

const appStack = new AgentraAppStack(app, `AgentraAppStack-${stageLabel}`, {
  description: `Agentra ${stageLabel} backend application stack (Lambda and HTTP API).`,
  dataAuthStack,
  agentCoreRuntimeArn: agentCoreRuntimeStack.runtimeArn,
  agentCoreRuntimeQualifier: 'prod',
  allowedCorsOrigins: resolvedCorsOrigins,
});
appStack.addDependency(dataAuthStack);
appStack.addDependency(agentCoreRuntimeStack);

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

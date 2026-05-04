#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentraAgentCoreRuntimeStack } from '../lib/agentra-agentcore-runtime-stack.js';
import { AgentraAgentCoreStack } from '../lib/agentra-agentcore-stack.js';
import { AgentraAppStack } from '../lib/agentra-app-stack.js';
import { AgentraDataAuthStack } from '../lib/agentra-data-auth-stack.js';
import { AgentraSlideRuntimeStack } from '../lib/agentra-slide-runtime-stack.js';
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

const agentCoreRuntimeStack = new AgentraAgentCoreRuntimeStack(
  app,
  `AgentraAgentCoreRuntimeStack-${stageLabel}`,
  {
    description: `Agentra ${stageLabel} AgentCore runtime stack (TypeScript runtime and endpoint).`,
    stage: stageLabel,
  },
);

const slideRuntimeStack = new AgentraSlideRuntimeStack(
  app,
  `AgentraSlideRuntimeStack-${stageLabel}`,
  {
    description: `Agentra ${stageLabel} slide generation runtime stack.`,
    stage: stageLabel,
  },
);

const appStack = new AgentraAppStack(app, `AgentraAppStack-${stageLabel}`, {
  description: `Agentra ${stageLabel} backend application stack (Lambda and HTTP API).`,
  dataAuthStack,
  agentCoreRuntimeArn: agentCoreRuntimeStack.runtimeArn,
  agentCoreRuntimeQualifier: 'prod',
  slideRuntimeArn: slideRuntimeStack.runtimeArn,
  slideRuntimeQualifier: 'prod',
  presentationArtifactsBucketName: slideRuntimeStack.artifactsBucketName,
  allowedCorsOrigins: resolvedCorsOrigins,
});
appStack.addDependency(dataAuthStack);
appStack.addDependency(agentCoreRuntimeStack);
appStack.addDependency(slideRuntimeStack);

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

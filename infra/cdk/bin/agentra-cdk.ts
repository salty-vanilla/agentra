#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentraAgentCoreStack } from '../lib/agentra-agentcore-stack.js';
import { AgentraAgentCoreRuntimeStack } from '../lib/agentra-agentcore-runtime-stack.js';
import { AgentraAppStack } from '../lib/agentra-app-stack.js';
import { AgentraBedrockStack } from '../lib/agentra-bedrock-stack.js';
import { AgentraDataAuthStack } from '../lib/agentra-data-auth-stack.js';
import { AgentraWebHostingStack } from '../lib/agentra-web-hosting-stack.js';

const app = new cdk.App();

const dataAuthStack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack', {
  description: 'Agentra data/auth stack (Cognito and DynamoDB).',
});

const bedrockStack = new AgentraBedrockStack(app, 'AgentraBedrockStack', {
  description: 'Agentra Bedrock stack (agents and aliases).',
});

new AgentraAgentCoreStack(app, 'AgentraAgentCoreStack', {
  description: 'Agentra AgentCore stack (gateway foundation).',
});

const agentCoreRuntimeStack = new AgentraAgentCoreRuntimeStack(app, 'AgentraAgentCoreRuntimeStack', {
  description: 'Agentra AgentCore runtime stack (TypeScript runtime and endpoint).',
});

const appStack = new AgentraAppStack(app, 'AgentraAppStack', {
  description: 'Agentra backend application stack (Lambda and HTTP API).',
  dataAuthStack,
  bedrockStack,
  agentCoreRuntimeArn: agentCoreRuntimeStack.runtimeArn,
  agentCoreRuntimeQualifier: 'prod',
});
appStack.addDependency(dataAuthStack);
appStack.addDependency(bedrockStack);
appStack.addDependency(agentCoreRuntimeStack);

const webHostingStack = new AgentraWebHostingStack(app, 'AgentraWebHostingStack', {
  description: 'Agentra web hosting stack (Amplify Hosting).',
  appStack,
  dataAuthStack,
});
webHostingStack.addDependency(appStack);
webHostingStack.addDependency(dataAuthStack);

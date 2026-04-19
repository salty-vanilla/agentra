#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
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

const appStack = new AgentraAppStack(app, 'AgentraAppStack', {
  description: 'Agentra backend application stack (Lambda and HTTP API).',
  dataAuthStack,
  bedrockStack,
});
appStack.addDependency(dataAuthStack);
appStack.addDependency(bedrockStack);

const webHostingStack = new AgentraWebHostingStack(app, 'AgentraWebHostingStack', {
  description: 'Agentra web hosting stack (Amplify Hosting).',
  appStack,
  dataAuthStack,
});
webHostingStack.addDependency(appStack);
webHostingStack.addDependency(dataAuthStack);

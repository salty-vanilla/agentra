#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentraCoreStack } from '../lib/agentra-core-stack.js';

const app = new cdk.App();

new AgentraCoreStack(app, 'AgentraCoreStack', {
  description: 'Initial Agentra stack with Hono Lambda and HTTP API.',
});

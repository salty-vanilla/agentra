import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

function getResources(template: Template, type: string) {
  const resources = template.findResources(type);
  return Object.values(resources);
}

function expectRemovalPolicy(resource: any, policy: 'Delete' | 'Retain') {
  expect(resource.DeletionPolicy).toBe(policy);
  expect(resource.UpdateReplacePolicy).toBe(policy);
}

describe('AgentraDataAuthStack', () => {
  it('destroys data/auth resources in dev', () => {
    const app = new App();
    const stack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack-dev', {
      stage: 'dev',
    });
    const template = Template.fromStack(stack);

    const userPools = getResources(template, 'AWS::Cognito::UserPool');
    expect(userPools).toHaveLength(1);
    expectRemovalPolicy(userPools[0], 'Delete');

    const tables = getResources(template, 'AWS::DynamoDB::Table');
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expectRemovalPolicy(table, 'Delete');
    }
  });

  it('retains data/auth resources outside dev', () => {
    const app = new App();
    const stack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack-prod', {
      stage: 'prod',
    });
    const template = Template.fromStack(stack);

    const userPools = getResources(template, 'AWS::Cognito::UserPool');
    expect(userPools).toHaveLength(1);
    expectRemovalPolicy(userPools[0], 'Retain');

    const tables = getResources(template, 'AWS::DynamoDB::Table');
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expectRemovalPolicy(table, 'Retain');
    }
  });
});

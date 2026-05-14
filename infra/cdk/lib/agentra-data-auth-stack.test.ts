import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

function getResources(template: Template, type: string) {
  const resources = template.findResources(type);
  return Object.values(resources);
}

function expectRemovalPolicy(
  resource: { DeletionPolicy?: string; UpdateReplacePolicy?: string } | undefined,
  policy: 'Delete' | 'Retain',
) {
  if (!resource) {
    throw new Error('Expected resource to be defined');
  }
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

  it('disables unused password auth flows in Cognito app client', () => {
    const app = new App();
    const stack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack', {
      stage: 'prod',
    });
    const template = Template.fromStack(stack);

    // Verify password flows are NOT in ExplicitAuthFlows
    const clients = getResources(template, 'AWS::Cognito::UserPoolClient');
    expect(clients).toHaveLength(1);

    const client = clients[0] as
      | { Properties: { ExplicitAuthFlows: string[] } }
      | undefined;
    expect(client).toBeDefined();

    if (!client?.Properties?.ExplicitAuthFlows) {
      throw new Error('ExplicitAuthFlows not found in client properties');
    }

    const explicitAuthFlows = client.Properties.ExplicitAuthFlows;
    expect(explicitAuthFlows).not.toContain('ALLOW_USER_PASSWORD_AUTH');
    expect(explicitAuthFlows).not.toContain('ALLOW_ADMIN_USER_PASSWORD_AUTH');
    expect(explicitAuthFlows).not.toContain('ALLOW_USER_SRP_AUTH');
  });

  it('enables OAuth authorization-code grant in Cognito app client', () => {
    const app = new App();
    const stack = new AgentraDataAuthStack(app, 'AgentraDataAuthStack', {
      stage: 'prod',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
    });
  });
});

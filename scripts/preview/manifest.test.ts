import { describe, expect, test } from 'vitest';
import {
  type AwsIdentity,
  buildBackendEnv,
  buildFrontendEnv,
  buildManifest,
  buildPlan,
  type CdkOutputs,
  normalizeOutputs,
} from './manifest.js';
import { resolvePreviewConfig } from './preview-stage.js';

const FIXED_NOW = new Date('2026-05-29T00:00:00.000Z');
const config = resolvePreviewConfig({
  stage: 'local-nakatsuka-a1b2c3d',
  profile: 'minimal-api',
  owner: 'nakatsuka',
  source: 'local-claude-code',
  now: FIXED_NOW,
});
const identity: AwsIdentity = {
  accountId: '111122223333',
  region: 'ap-northeast-1',
  arn: 'arn:aws:iam::111122223333:user/preview',
};
const stacks = [
  'AgentraPreview-local-nakatsuka-a1b2c3d-DataAuth',
  'AgentraPreview-local-nakatsuka-a1b2c3d-Backend',
];

const fullOutputs: CdkOutputs = {
  'AgentraPreview-local-nakatsuka-a1b2c3d-Backend': {
    HttpApiUrl: 'https://bff.example.com',
    StreamingApiUrl: 'https://stream.example.com',
  },
  'AgentraPreview-local-nakatsuka-a1b2c3d-DataAuth': {
    UserPoolId: 'ap-northeast-1_abc',
    UserPoolClientId: 'client-123',
    CognitoDomain: 'agentra-local.auth.ap-northeast-1.amazoncognito.com',
    UsersTableName: 'agentra-users',
  },
};

describe('buildPlan', () => {
  test('captures config, identity, and stacks', () => {
    const plan = buildPlan(config, identity, stacks);

    expect(plan).toMatchObject({
      project: 'Agentra',
      environmentType: 'preview',
      stage: 'local-nakatsuka-a1b2c3d',
      profile: 'minimal-api',
      accountId: '111122223333',
      region: 'ap-northeast-1',
      stackPrefix: 'AgentraPreview-local-nakatsuka-a1b2c3d',
      stacks,
    });
    expect(plan.tags.EnvironmentType).toBe('preview');
  });

  test('uses null account/region when identity is unavailable', () => {
    const plan = buildPlan(config, null, stacks);
    expect(plan.accountId).toBeNull();
    expect(plan.region).toBeNull();
  });
});

describe('normalizeOutputs', () => {
  test('maps known CfnOutput keys to normalized keys across stacks', () => {
    expect(normalizeOutputs(fullOutputs)).toEqual({
      bffApiUrl: 'https://bff.example.com',
      streamingApiUrl: 'https://stream.example.com',
      userPoolId: 'ap-northeast-1_abc',
      userPoolClientId: 'client-123',
      cognitoDomain: 'agentra-local.auth.ap-northeast-1.amazoncognito.com',
    });
  });

  test('omits keys that are missing — never invents values', () => {
    const partial: CdkOutputs = {
      'AgentraPreview-local-nakatsuka-a1b2c3d-Backend': {
        HttpApiUrl: 'https://bff.example.com',
      },
    };

    const outputs = normalizeOutputs(partial);
    expect(outputs).toEqual({ bffApiUrl: 'https://bff.example.com' });
    expect(outputs).not.toHaveProperty('userPoolId');
    expect(outputs).not.toHaveProperty('streamingApiUrl');
  });

  test('ignores empty-string values', () => {
    const withEmpty: CdkOutputs = {
      Stack: { HttpApiUrl: '', UserPoolId: 'pool-1' },
    };
    expect(normalizeOutputs(withEmpty)).toEqual({ userPoolId: 'pool-1' });
  });

  test('maps the AgentCore runtime ARN for AI-profile smoke checks', () => {
    const withRuntime: CdkOutputs = {
      'AgentraPreview-pr-1-AgentCoreRuntime': {
        AgentCoreRuntimeArn:
          'arn:aws:bedrock-agentcore:ap-northeast-1:111122223333:runtime/abc',
      },
    };
    expect(normalizeOutputs(withRuntime)).toEqual({
      agentCoreRuntimeArn:
        'arn:aws:bedrock-agentcore:ap-northeast-1:111122223333:runtime/abc',
    });
  });

  test('maps AgentCore log group names for the log-correlation smoke check', () => {
    const withLogGroups: CdkOutputs = {
      'AgentraPreview-pr-1-AgentCoreRuntime': {
        AgentCoreLogGroupNames:
          '/aws/bedrock-agentcore/runtimes/r-DEFAULT,/aws/bedrock-agentcore/runtimes/r-prod',
      },
    };
    expect(normalizeOutputs(withLogGroups)).toEqual({
      agentCoreLogGroupNames:
        '/aws/bedrock-agentcore/runtimes/r-DEFAULT,/aws/bedrock-agentcore/runtimes/r-prod',
    });
  });
});

describe('buildManifest', () => {
  test('includes owner/source and only present outputs', () => {
    const manifest = buildManifest(
      config,
      identity,
      stacks,
      normalizeOutputs(fullOutputs),
    );

    expect(manifest).toMatchObject({
      stage: 'local-nakatsuka-a1b2c3d',
      profile: 'minimal-api',
      owner: 'nakatsuka',
      source: 'local-claude-code',
      accountId: '111122223333',
      region: 'ap-northeast-1',
      stacks,
    });
    expect(manifest.outputs.bffApiUrl).toBe('https://bff.example.com');
    expect(manifest.outputs).not.toHaveProperty('artifactBucketName');
  });
});

describe('env file generation', () => {
  test('backend env maps present outputs to smoke env vars', () => {
    const env = buildBackendEnv(normalizeOutputs(fullOutputs));
    expect(env).toContain('AGENTRA_API_BASE_URL=https://bff.example.com');
    expect(env).toContain('AGENTRA_STREAMING_API_BASE_URL=https://stream.example.com');
    expect(env).toContain('COGNITO_USER_POOL_ID=ap-northeast-1_abc');
    expect(env).toContain('COGNITO_USER_POOL_CLIENT_ID=client-123');
  });

  test('frontend env maps present outputs to NEXT_PUBLIC vars', () => {
    const env = buildFrontendEnv(normalizeOutputs(fullOutputs));
    expect(env).toContain('NEXT_PUBLIC_API_BASE_URL=https://bff.example.com');
    expect(env).toContain('NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-northeast-1_abc');
    expect(env).toContain(
      'NEXT_PUBLIC_COGNITO_DOMAIN=agentra-local.auth.ap-northeast-1.amazoncognito.com',
    );
  });

  test('omits lines for missing outputs and returns empty string when none', () => {
    expect(buildBackendEnv({})).toBe('');
    const partial = buildBackendEnv({ bffApiUrl: 'https://bff.example.com' });
    expect(partial).toBe('AGENTRA_API_BASE_URL=https://bff.example.com\n');
    expect(partial).not.toContain('COGNITO_USER_POOL_ID');
  });
});

import { App, Stack } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { addPreviewStacks, resolvePreviewCdkContext } from './preview-context.js';

const PREVIEW_STAGE = 'pr-123';
const PREFIX = `AgentraPreview-${PREVIEW_STAGE}`;

function previewApp(context: Record<string, unknown> = {}): App {
  return new App({
    context: {
      environmentType: 'preview',
      stage: PREVIEW_STAGE,
      ...context,
    },
  });
}

function previewStackNames(app: App): string[] {
  return app.node.children
    .filter((child): child is Stack => Stack.isStack(child))
    .map((stack) => stack.stackName);
}

function synthPreview(context: Record<string, unknown> = {}): App {
  const app = previewApp(context);
  const resolved = resolvePreviewCdkContext(app);
  if (!resolved) {
    throw new Error('Expected preview context to resolve');
  }
  addPreviewStacks(app, resolved);
  return app;
}

// Matches the dummy ARN used by `synth:ci`; the AI runtime stacks require it.
const DUMMY_SECRET_ARN =
  'arn:aws:secretsmanager:us-east-1:000000000000:secret:dummy-AbCdEf';

const REQUIRED_TAG_KEYS = [
  'Project',
  'EnvironmentType',
  'Stage',
  'Owner',
  'Source',
  'ExpiresAt',
  'CreatedBy',
  'ManagedBy',
  'PreviewProfile',
];

describe('resolvePreviewCdkContext', () => {
  it('returns null when environmentType is not preview', () => {
    const app = new App({ context: { stage: 'dev' } });

    expect(resolvePreviewCdkContext(app)).toBeNull();
  });

  it('resolves a valid preview stage with the AgentraPreview-<stage> prefix', () => {
    const context = resolvePreviewCdkContext(
      previewApp({ previewProfile: 'minimal-api' }),
    );

    expect(context).not.toBeNull();
    expect(context?.config.stackPrefix).toBe(PREFIX);
    expect(context?.config.profile).toBe('minimal-api');
    expect(context?.environmentKind).toBe('ephemeral');
  });

  it.each([
    'dev',
    'prod',
    'main',
    'staging',
    'shared',
  ])('throws for forbidden stage "%s"', (stage) => {
    expect(() => resolvePreviewCdkContext(previewApp({ stage }))).toThrow();
  });

  it('throws for an over-length preview stage', () => {
    const longStage = `pr-${'9'.repeat(40)}`;

    expect(() => resolvePreviewCdkContext(previewApp({ stage: longStage }))).toThrow(
      /exceeds maximum/,
    );
  });

  it('throws for an invalid preview profile', () => {
    expect(() =>
      resolvePreviewCdkContext(previewApp({ previewProfile: 'everything' })),
    ).toThrow();
  });

  it('merges PreviewProfile and optional PR/Branch/CommitSha into tags', () => {
    const context = resolvePreviewCdkContext(
      previewApp({
        previewProfile: 'minimal-api',
        owner: 'nakatsuka',
        source: 'github-actions',
        pullRequest: '123',
        branch: 'feature/x',
        commitSha: 'abc1234',
      }),
    );

    expect(context?.tags).toMatchObject({
      Project: 'Agentra',
      EnvironmentType: 'preview',
      Stage: PREVIEW_STAGE,
      Owner: 'nakatsuka',
      Source: 'github-actions',
      CreatedBy: 'preview-cli',
      ManagedBy: 'cdk',
      PreviewProfile: 'minimal-api',
      PullRequest: '123',
      Branch: 'feature/x',
      CommitSha: 'abc1234',
    });
  });
});

describe('addPreviewStacks profile gating', () => {
  it('minimal-api synthesizes only DataAuth and Backend', () => {
    const app = synthPreview({ previewProfile: 'minimal-api' });

    expect(previewStackNames(app).sort()).toEqual(
      [`${PREFIX}-DataAuth`, `${PREFIX}-Backend`].sort(),
    );
  });

  it('backend-ai adds AI runtime and knowledge base, but not Frontend', () => {
    const app = synthPreview({
      previewProfile: 'backend-ai',
      thirdPartyApiKeysSecretArn: DUMMY_SECRET_ARN,
    });
    const names = previewStackNames(app);

    expect(names.sort()).toEqual(
      [
        `${PREFIX}-DataAuth`,
        `${PREFIX}-Backend`,
        `${PREFIX}-AgentCore`,
        `${PREFIX}-AgentCoreRuntime`,
        `${PREFIX}-KnowledgeBase`,
        `${PREFIX}-SlideRuntime`,
      ].sort(),
    );
    expect(names).not.toContain(`${PREFIX}-Frontend`);
  });

  it('full adds Frontend hosting', () => {
    const app = synthPreview({
      previewProfile: 'full',
      thirdPartyApiKeysSecretArn: DUMMY_SECRET_ARN,
    });

    expect(previewStackNames(app)).toContain(`${PREFIX}-Frontend`);
  });

  it('defaults to minimal-api when previewProfile is omitted', () => {
    const app = synthPreview();

    expect(previewStackNames(app).sort()).toEqual(
      [`${PREFIX}-DataAuth`, `${PREFIX}-Backend`].sort(),
    );
  });
});

describe('addPreviewStacks naming and tags', () => {
  it('prefixes both the construct id and the CloudFormation stackName', () => {
    const app = synthPreview({ previewProfile: 'minimal-api' });

    const stacks = app.node.children.filter((child): child is Stack =>
      Stack.isStack(child),
    );
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) {
      expect(stack.node.id.startsWith(`${PREFIX}-`)).toBe(true);
      expect(stack.stackName.startsWith(`${PREFIX}-`)).toBe(true);
    }
  });

  it('applies all required tags to every preview stack', () => {
    const app = synthPreview({
      previewProfile: 'minimal-api',
      owner: 'nakatsuka',
      source: 'local-claude-code',
    });
    const assembly = app.synth();

    for (const stackName of [`${PREFIX}-DataAuth`, `${PREFIX}-Backend`]) {
      const artifact = assembly.getStackByName(stackName);
      for (const key of REQUIRED_TAG_KEYS) {
        expect(artifact.tags).toHaveProperty(key);
      }
      expect(artifact.tags.EnvironmentType).toBe('preview');
      expect(artifact.tags.Stage).toBe(PREVIEW_STAGE);
      expect(artifact.tags.PreviewProfile).toBe('minimal-api');
    }
  });
});

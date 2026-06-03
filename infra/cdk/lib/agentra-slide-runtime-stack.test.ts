import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AgentraSlideRuntimeStack } from './agentra-slide-runtime-stack.js';

function synth(deckPreviewEnabled?: boolean) {
  const app = new App();
  const stack = new AgentraSlideRuntimeStack(app, 'AgentraSlideRuntimeStack-test', {
    stage: 'pr-test',
    ...(deckPreviewEnabled !== undefined ? { deckPreviewEnabled } : {}),
  });
  return Template.fromStack(stack);
}

function runtimeEnv(template: Template): Record<string, unknown> {
  const runtimes = template.findResources('AWS::BedrockAgentCore::Runtime');
  const runtime = Object.values(runtimes)[0] as {
    Properties: { EnvironmentVariables: Record<string, unknown> };
  };
  return runtime.Properties.EnvironmentVariables;
}

describe('AgentraSlideRuntimeStack — deck Live Preview', () => {
  it('defaults the deck preview flag to false', () => {
    const env = runtimeEnv(synth());
    expect(env.PRESENTATION_DECK_PREVIEW_ENABLED).toBe('false');
    expect(env.PRESENTATION_DECK_PREVIEW_BUDGET_MS).toBe('45000');
  });

  it('enables the deck preview flag when opted in', () => {
    const env = runtimeEnv(synth(true));
    expect(env.PRESENTATION_DECK_PREVIEW_ENABLED).toBe('true');
  });

  it('grants the runtime role S3 access to the decks/ prefix (deck-store)', () => {
    const template = synth(true);
    const policies = template.findResources('AWS::IAM::Policy');
    const allStatements = Object.values(policies).flatMap(
      (p) =>
        (p as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties
          .PolicyDocument.Statement,
    );
    const serialized = JSON.stringify(allStatements);
    // Object actions must cover decks/* (else deck-store PutObject/presign is denied).
    expect(serialized).toContain('decks/*');
    // ListBucket prefix condition must include decks/*.
    expect(serialized).toContain('decks');
  });

  it('adds a lifecycle expiration for the decks/ prefix', () => {
    const template = synth();
    const buckets = template.findResources('AWS::S3::Bucket');
    const rules = Object.values(buckets).flatMap(
      (b) =>
        (
          b as {
            Properties: { LifecycleConfiguration?: { Rules: { Prefix?: string }[] } };
          }
        ).Properties.LifecycleConfiguration?.Rules ?? [],
    );
    expect(rules.some((r) => r.Prefix === 'decks/')).toBe(true);
    expect(rules.some((r) => r.Prefix === 'runs/')).toBe(true);
  });
});

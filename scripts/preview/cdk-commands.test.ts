import { describe, expect, test } from 'vitest';
import {
  buildCdkDeployArgs,
  buildCdkListArgs,
  buildCdkSynthArgs,
  buildPreviewContextArgs,
  filterPreviewStacks,
} from './cdk-commands.js';
import { resolvePreviewConfig } from './preview-stage.js';

const FIXED_NOW = new Date('2026-05-29T00:00:00.000Z');

function config(stage = 'local-nakatsuka-a1b2c3d', profile = 'minimal-api') {
  return resolvePreviewConfig({ stage, profile, now: FIXED_NOW });
}

describe('buildPreviewContextArgs', () => {
  test('selects the preview path and passes guardrail-validated values', () => {
    const args = buildPreviewContextArgs(config());

    expect(args).toContain('environmentType=preview');
    expect(args).toContain('stage=local-nakatsuka-a1b2c3d');
    expect(args).toContain('previewProfile=minimal-api');
    expect(args).toContain('owner=unknown');
    expect(args).toContain('source=human');
    expect(args).toContain('ttlHours=8');
  });
});

describe('buildCdkSynthArgs / buildCdkListArgs', () => {
  test('synth runs quietly and carries the preview context', () => {
    const args = buildCdkSynthArgs(config());
    expect(args.slice(0, 2)).toEqual(['synth', '--quiet']);
    expect(args).toContain('environmentType=preview');
  });

  test('list carries the preview context', () => {
    const args = buildCdkListArgs(config());
    expect(args[0]).toBe('list');
    expect(args).toContain('environmentType=preview');
  });
});

describe('filterPreviewStacks', () => {
  const prefix = 'AgentraPreview-local-nakatsuka-a1b2c3d';

  test('keeps only stacks under the prefixed namespace', () => {
    const all = [
      `${prefix}-DataAuth`,
      `${prefix}-Backend`,
      'AgentraAppStack-prod',
      'AgentraDataAuthStack-dev',
    ];

    expect(filterPreviewStacks(all, prefix)).toEqual([
      `${prefix}-DataAuth`,
      `${prefix}-Backend`,
    ]);
  });

  test('excludes stacks of a similar-but-different stage prefix', () => {
    const shortPrefix = 'AgentraPreview-local-foo-aaa';
    const all = [
      'AgentraPreview-local-foo-aaa-Backend',
      'AgentraPreview-local-foo-aaabbb-Backend',
    ];

    expect(filterPreviewStacks(all, shortPrefix)).toEqual([
      'AgentraPreview-local-foo-aaa-Backend',
    ]);
  });

  test('does not match the bare prefix without a trailing hyphen', () => {
    const prefixOnly = 'AgentraPreview-local-foo-aaa';
    expect(filterPreviewStacks([prefixOnly], prefixOnly)).toEqual([]);
  });
});

describe('buildCdkDeployArgs', () => {
  const stacks = [
    'AgentraPreview-local-nakatsuka-a1b2c3d-DataAuth',
    'AgentraPreview-local-nakatsuka-a1b2c3d-Backend',
  ];
  const outputsFile = '.agentra/preview/local-nakatsuka-a1b2c3d/cdk-outputs.json';

  test('targets explicit stacks with no-approval and an outputs file', () => {
    const args = buildCdkDeployArgs(config(), stacks, outputsFile);

    expect(args[0]).toBe('deploy');
    expect(args).toContain(stacks[0]);
    expect(args).toContain(stacks[1]);
    expect(args).toContain('--require-approval');
    expect(args).toContain('never');
    expect(args).toContain('--outputs-file');
    expect(args).toContain(outputsFile);
  });

  test('never includes --all', () => {
    const args = buildCdkDeployArgs(config(), stacks, outputsFile);
    expect(args).not.toContain('--all');
  });

  test('throws when no explicit stacks are provided', () => {
    expect(() => buildCdkDeployArgs(config(), [], outputsFile)).toThrow(
      /no explicit stacks/,
    );
  });

  test('throws when a stack name looks like a flag', () => {
    expect(() => buildCdkDeployArgs(config(), ['--all'], outputsFile)).toThrow(
      /must not look like CLI flags/,
    );
  });
});

describe('guardrail integration (resolvePreviewConfig)', () => {
  test('rejects a forbidden stage', () => {
    expect(() => config('prod')).toThrow(/Invalid preview stage/);
  });

  test('rejects an invalid profile', () => {
    expect(() => config('pr-1', 'enormous')).toThrow(/Invalid preview profile/);
  });
});

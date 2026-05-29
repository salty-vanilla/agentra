import { describe, expect, test } from 'vitest';
import { parseDestroyArgs } from './destroy-args.js';

describe('parseDestroyArgs', () => {
  test('parses stage, profile, and confirm with --flag value form', () => {
    const args = parseDestroyArgs([
      '--stage',
      'pr-123',
      '--profile',
      'minimal-api',
      '--confirm',
      'pr-123',
    ]);
    expect(args).toEqual({
      stage: 'pr-123',
      profile: 'minimal-api',
      confirm: 'pr-123',
      dryRun: false,
    });
  });

  test('parses the --flag=value form', () => {
    const args = parseDestroyArgs(['--stage=pr-123', '--profile=full']);
    expect(args).toEqual({ stage: 'pr-123', profile: 'full', dryRun: false });
  });

  test('treats --dry-run as a boolean flag', () => {
    const args = parseDestroyArgs([
      '--stage',
      'pr-123',
      '--profile',
      'full',
      '--dry-run',
    ]);
    expect(args.dryRun).toBe(true);
    expect(args.confirm).toBeUndefined();
  });

  test('surfaces an empty --confirm= value so the guard can reject it', () => {
    const args = parseDestroyArgs(['--stage=pr-123', '--profile=full', '--confirm=']);
    expect(args.confirm).toBe('');
  });

  test('throws when --stage is missing', () => {
    expect(() => parseDestroyArgs(['--profile', 'full'])).toThrow(
      /Missing required flag "--stage"/,
    );
  });

  test('throws when --profile is missing', () => {
    expect(() => parseDestroyArgs(['--stage', 'pr-123'])).toThrow(
      /Missing required flag "--profile"/,
    );
  });

  test('throws on an unknown flag', () => {
    expect(() =>
      parseDestroyArgs(['--stage', 'pr-123', '--profile', 'full', '--yes']),
    ).toThrow(/Unknown flag "--yes"/);
  });

  test('throws when --dry-run is given a value', () => {
    expect(() =>
      parseDestroyArgs(['--stage', 'pr-123', '--profile', 'full', '--dry-run=true']),
    ).toThrow(/boolean and does not take a value/);
  });

  test('throws on a positional argument', () => {
    expect(() => parseDestroyArgs(['pr-123'])).toThrow(/Unexpected argument/);
  });
});

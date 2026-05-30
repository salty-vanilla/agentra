import { describe, expect, test } from 'vitest';
import { parseCleanupArgs } from './cleanup-args.js';

describe('parseCleanupArgs', () => {
  test('defaults to dry-run with no flags', () => {
    expect(parseCleanupArgs([])).toEqual({ mode: 'dry-run' });
  });

  test('selects dry-run explicitly', () => {
    expect(parseCleanupArgs(['--dry-run'])).toEqual({ mode: 'dry-run' });
  });

  test('selects execute mode', () => {
    expect(parseCleanupArgs(['--execute'])).toEqual({ mode: 'execute' });
  });

  test('parses --stage and --confirm (space and equals forms)', () => {
    expect(
      parseCleanupArgs(['--execute', '--stage', 'pr-307', '--confirm', 'pr-307']),
    ).toEqual({ mode: 'execute', stage: 'pr-307', confirm: 'pr-307' });
    expect(parseCleanupArgs(['--stage=pr-1', '--confirm=all'])).toEqual({
      mode: 'dry-run',
      stage: 'pr-1',
      confirm: 'all',
    });
  });

  test('rejects supplying both --dry-run and --execute', () => {
    expect(() => parseCleanupArgs(['--dry-run', '--execute'])).toThrow(
      /mutually exclusive/,
    );
  });

  test('rejects an unknown flag', () => {
    expect(() => parseCleanupArgs(['--force'])).toThrow(/Unknown flag/);
  });

  test('rejects a positional argument', () => {
    expect(() => parseCleanupArgs(['pr-307'])).toThrow(/Unexpected argument/);
  });

  test('rejects a value on a boolean flag', () => {
    expect(() => parseCleanupArgs(['--execute=yes'])).toThrow(/boolean/);
  });

  test('rejects a missing value for a value flag', () => {
    expect(() => parseCleanupArgs(['--stage'])).toThrow(/Missing value/);
  });
});

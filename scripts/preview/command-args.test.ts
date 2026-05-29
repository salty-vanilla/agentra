import { describe, expect, test } from 'vitest';
import { parseCommandArgs } from './command-args.js';

describe('parseCommandArgs', () => {
  test('parses --flag value pairs', () => {
    const args = parseCommandArgs([
      '--stage',
      'local-nakatsuka-a1b2c3d',
      '--profile',
      'minimal-api',
    ]);

    expect(args).toEqual({
      stage: 'local-nakatsuka-a1b2c3d',
      profile: 'minimal-api',
    });
  });

  test('parses --flag=value form', () => {
    const args = parseCommandArgs(['--stage=pr-307', '--profile=full']);

    expect(args).toEqual({ stage: 'pr-307', profile: 'full' });
  });

  test('parses optional owner, source, and numeric ttl-hours', () => {
    const args = parseCommandArgs([
      '--stage',
      'pr-1',
      '--owner',
      'nakatsuka',
      '--source',
      'local-claude-code',
      '--ttl-hours',
      '6',
    ]);

    expect(args).toEqual({
      stage: 'pr-1',
      owner: 'nakatsuka',
      source: 'local-claude-code',
      ttlHours: 6,
    });
  });

  test('throws when --stage is missing', () => {
    expect(() => parseCommandArgs(['--profile', 'minimal-api'])).toThrow(
      /Missing required flag/,
    );
  });

  test('throws on unknown flags', () => {
    expect(() => parseCommandArgs(['--stage', 'pr-1', '--region', 'x'])).toThrow(
      /Unknown flag "--region"/,
    );
  });

  test('throws on positional arguments', () => {
    expect(() => parseCommandArgs(['deploy', '--stage', 'pr-1'])).toThrow(
      /Unexpected argument/,
    );
  });

  test('throws when a flag is missing its value', () => {
    expect(() => parseCommandArgs(['--stage'])).toThrow(
      /Missing value for flag "--stage"/,
    );
  });

  test('throws when --ttl-hours is not a number', () => {
    expect(() => parseCommandArgs(['--stage', 'pr-1', '--ttl-hours', 'soon'])).toThrow(
      /Invalid --ttl-hours/,
    );
  });

  test('does not mutate the input array', () => {
    const argv = ['--stage', 'pr-1'];
    const copy = [...argv];
    parseCommandArgs(argv);
    expect(argv).toEqual(copy);
  });
});

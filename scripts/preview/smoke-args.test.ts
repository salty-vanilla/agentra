import { describe, expect, test } from 'vitest';
import { parseSmokeArgs } from './smoke-args.js';

describe('parseSmokeArgs', () => {
  test('parses --stage', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307'])).toEqual({ stage: 'pr-307' });
  });

  test('parses --flag=value form', () => {
    expect(parseSmokeArgs(['--stage=pr-307'])).toEqual({ stage: 'pr-307' });
  });

  test('parses an explicit --manifest path', () => {
    expect(
      parseSmokeArgs(['--stage', 'pr-307', '--manifest', '/tmp/manifest.json']),
    ).toEqual({ stage: 'pr-307', manifest: '/tmp/manifest.json' });
  });

  test('throws when --stage is missing', () => {
    expect(() => parseSmokeArgs(['--manifest', 'm.json'])).toThrow(
      /Missing required flag/,
    );
  });

  test('throws on an unknown flag', () => {
    expect(() => parseSmokeArgs(['--stage', 'pr-307', '--profile', 'full'])).toThrow(
      /Unknown flag/,
    );
  });

  test('throws on a missing flag value', () => {
    expect(() => parseSmokeArgs(['--stage'])).toThrow(/Missing value/);
  });

  test('throws on a positional argument', () => {
    expect(() => parseSmokeArgs(['pr-307'])).toThrow(/Unexpected argument/);
  });
});

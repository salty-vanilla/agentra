import { describe, expect, test } from 'vitest';
import { parseSmokeArgs } from './smoke-args.js';

describe('parseSmokeArgs', () => {
  test('parses --stage', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307'])).toEqual({
      stage: 'pr-307',
      mode: 'core',
      withLogCorrelation: false,
    });
  });

  test('parses --flag=value form', () => {
    expect(parseSmokeArgs(['--stage=pr-307'])).toEqual({
      stage: 'pr-307',
      mode: 'core',
      withLogCorrelation: false,
    });
  });

  test('parses an explicit --manifest path', () => {
    expect(
      parseSmokeArgs(['--stage', 'pr-307', '--manifest', '/tmp/manifest.json']),
    ).toEqual({
      stage: 'pr-307',
      manifest: '/tmp/manifest.json',
      mode: 'core',
      withLogCorrelation: false,
    });
  });

  test('defaults --mode to core', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307']).mode).toBe('core');
  });

  test('parses --mode full', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307', '--mode', 'full'])).toEqual({
      stage: 'pr-307',
      mode: 'full',
      withLogCorrelation: false,
    });
  });

  test('parses --mode=full form', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307', '--mode=full']).mode).toBe('full');
  });

  test('throws on an invalid --mode value', () => {
    expect(() => parseSmokeArgs(['--stage', 'pr-307', '--mode', 'deep'])).toThrow(
      /Invalid --mode "deep"/,
    );
  });

  test('parses the boolean --with-log-correlation flag with no value', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307', '--with-log-correlation'])).toEqual({
      stage: 'pr-307',
      mode: 'core',
      withLogCorrelation: true,
    });
  });

  test('--with-log-correlation does not consume the following token as its value', () => {
    expect(parseSmokeArgs(['--with-log-correlation', '--stage', 'pr-307'])).toEqual({
      stage: 'pr-307',
      mode: 'core',
      withLogCorrelation: true,
    });
  });

  test('--with-log-correlation=false explicitly disables it', () => {
    expect(parseSmokeArgs(['--stage', 'pr-307', '--with-log-correlation=false'])).toEqual(
      {
        stage: 'pr-307',
        mode: 'core',
        withLogCorrelation: false,
      },
    );
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

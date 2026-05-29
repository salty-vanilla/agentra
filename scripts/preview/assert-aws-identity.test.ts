import { describe, expect, test } from 'vitest';
import {
  type AwsIdentity,
  checkAccountAllowlist,
  formatIdentityReport,
  parseAllowedAccounts,
  resolveRegion,
} from './assert-aws-identity.js';
import { resolvePreviewConfig } from './preview-stage.js';

describe('resolveRegion', () => {
  test('prefers AWS_REGION', () => {
    expect(resolveRegion({ AWS_REGION: 'ap-northeast-1' })).toBe('ap-northeast-1');
  });

  test('falls back to AWS_DEFAULT_REGION', () => {
    expect(resolveRegion({ AWS_DEFAULT_REGION: 'us-east-1' })).toBe('us-east-1');
  });

  test('returns undefined when neither is set', () => {
    expect(resolveRegion({})).toBeUndefined();
  });
});

describe('parseAllowedAccounts', () => {
  test('splits and trims a comma-separated list', () => {
    expect(parseAllowedAccounts(' 111122223333, 444455556666 ')).toEqual([
      '111122223333',
      '444455556666',
    ]);
  });

  test('returns an empty list for undefined or empty input', () => {
    expect(parseAllowedAccounts(undefined)).toEqual([]);
    expect(parseAllowedAccounts('')).toEqual([]);
  });
});

describe('checkAccountAllowlist', () => {
  test('treats an empty allowlist as not configured (allowed)', () => {
    expect(checkAccountAllowlist('111122223333', [])).toEqual({
      configured: false,
      allowed: true,
      allowedAccounts: [],
    });
  });

  test('allows an account present in a configured allowlist', () => {
    const result = checkAccountAllowlist('111122223333', ['111122223333']);
    expect(result.configured).toBe(true);
    expect(result.allowed).toBe(true);
  });

  test('rejects an account absent from a configured allowlist', () => {
    const result = checkAccountAllowlist('999988887777', ['111122223333']);
    expect(result.configured).toBe(true);
    expect(result.allowed).toBe(false);
  });
});

describe('formatIdentityReport', () => {
  test('prints account, region, arn, stage, profile, ttl, and expiry', () => {
    const identity: AwsIdentity = {
      accountId: '111122223333',
      region: 'ap-northeast-1',
      arn: 'arn:aws:iam::111122223333:user/preview',
    };
    const config = resolvePreviewConfig({
      stage: 'local-nakatsuka-a1b2c3d',
      profile: 'minimal-api',
      ttlHours: 6,
      now: new Date('2026-05-29T00:00:00.000Z'),
    });

    const report = formatIdentityReport(identity, config);

    expect(report).toContain('Preview deploy target:');
    expect(report).toContain('account: 111122223333');
    expect(report).toContain('region: ap-northeast-1');
    expect(report).toContain('arn: arn:aws:iam::111122223333:user/preview');
    expect(report).toContain('stage: local-nakatsuka-a1b2c3d');
    expect(report).toContain('profile: minimal-api');
    expect(report).toContain('ttlHours: 6');
    expect(report).toContain('expiresAt: 2026-05-29T06:00:00.000Z');
  });
});

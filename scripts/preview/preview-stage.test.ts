import { describe, expect, it } from 'vitest';
import {
  isPreviewStage,
  resolvePreviewConfig,
  validatePreviewStage,
} from './preview-stage.js';

describe('validatePreviewStage', () => {
  describe('accepted stages', () => {
    it.each([
      'pr-1',
      'pr-307',
      'sandbox-nakatsuka-202605282130',
      'local-nakatsuka-a1b2c3d',
      'local-user-name-abcdef123456',
    ])('accepts "%s"', (stage) => {
      expect(() => validatePreviewStage(stage)).not.toThrow();
    });
  });

  describe('rejects forbidden names (case-insensitive)', () => {
    it.each([
      'prod',
      'production',
      'staging',
      'stage',
      'demo',
      'dev',
      'main',
      'master',
      'default',
      'shared',
      'Prod',
      'MAIN',
      'Dev',
      'SHARED',
      'Demo',
    ])('rejects "%s"', (stage) => {
      expect(() => validatePreviewStage(stage)).toThrow(/Invalid preview stage/);
    });
  });

  describe('rejects invalid patterns', () => {
    it.each([
      'pr-main',
      'pr-abc',
      'pr-',
      'PR-307',
      'sandbox-user',
      'local-user-notasha',
      'feature/foo',
      '',
    ])('rejects "%s"', (stage) => {
      expect(() => validatePreviewStage(stage)).toThrow(/Invalid preview stage/);
    });
  });

  describe('rejects non-string and empty/whitespace inputs', () => {
    it('rejects undefined', () => {
      expect(() => validatePreviewStage(undefined)).toThrow(/expected string/);
    });

    it('rejects null', () => {
      expect(() => validatePreviewStage(null)).toThrow(/expected string/);
    });

    it('rejects number', () => {
      expect(() => validatePreviewStage(42)).toThrow(/expected string/);
    });

    it('rejects whitespace-only string', () => {
      expect(() => validatePreviewStage('   ')).toThrow(/empty or whitespace-only/);
    });
  });

  it('includes the stage name in the error message', () => {
    expect(() => validatePreviewStage('dev')).toThrow(/Invalid preview stage "dev"/);
  });

  it('mentions allowed patterns in the error message', () => {
    expect(() => validatePreviewStage('feature/foo')).toThrow(
      /pr-<number>.*sandbox-<user>.*local-<user>/s,
    );
  });

  it('mentions reserved stages in the error message', () => {
    expect(() => validatePreviewStage('invalid')).toThrow(/Reserved stages/);
  });
});

describe('isPreviewStage', () => {
  it.each([
    ['pr-1', true],
    ['pr-307', true],
    ['sandbox-nakatsuka-202605282130', true],
    ['local-nakatsuka-a1b2c3d', true],
    ['local-user-name-abcdef123456', true],
    ['prod', false],
    ['dev', false],
    ['Prod', false],
    ['MAIN', false],
    ['pr-abc', false],
    ['pr-main', false],
    ['feature/foo', false],
    ['sandbox-user', false],
    ['local-user-notasha', false],
    ['', false],
    ['   ', false],
  ] as const)('isPreviewStage(%s) === %s', (stage, expected) => {
    expect(isPreviewStage(stage)).toBe(expected);
  });

  it('returns false for undefined', () => {
    expect(isPreviewStage(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPreviewStage(null)).toBe(false);
  });

  it('returns false for number', () => {
    expect(isPreviewStage(42)).toBe(false);
  });
});

describe('resolvePreviewConfig', () => {
  const NOW = new Date('2026-01-01T00:00:00.000Z');
  const BASE = { stage: 'pr-1', now: NOW };

  describe('profile', () => {
    it('defaults to minimal-api when profile is omitted', () => {
      expect(resolvePreviewConfig(BASE).profile).toBe('minimal-api');
    });

    it.each([
      'minimal-api',
      'backend-ai',
      'full',
    ] as const)('accepts profile "%s"', (profile) => {
      expect(resolvePreviewConfig({ ...BASE, profile }).profile).toBe(profile);
    });

    it.each([
      'unknown',
      'invalid',
      '',
      'FULL',
      'minimal',
    ])('rejects invalid profile "%s"', (profile) => {
      expect(() => resolvePreviewConfig({ ...BASE, profile })).toThrow(
        /Invalid preview profile/,
      );
    });
  });

  describe('source', () => {
    it('defaults to "human" when source is omitted', () => {
      expect(resolvePreviewConfig(BASE).source).toBe('human');
    });

    it.each([
      'local-claude-code',
      'local-codex',
      'github-actions',
      'human',
    ] as const)('accepts source "%s"', (source) => {
      expect(resolvePreviewConfig({ ...BASE, source }).source).toBe(source);
    });

    it.each([
      'unknown',
      'invalid',
      '',
      'ci',
      'claude',
    ])('rejects invalid source "%s"', (source) => {
      expect(() => resolvePreviewConfig({ ...BASE, source })).toThrow(
        /Invalid preview source/,
      );
    });
  });

  describe('owner', () => {
    it('defaults to "unknown" when owner is omitted', () => {
      expect(resolvePreviewConfig(BASE).owner).toBe('unknown');
    });

    it('uses provided owner', () => {
      expect(resolvePreviewConfig({ ...BASE, owner: 'alice' }).owner).toBe('alice');
    });

    it('trims leading/trailing whitespace from owner', () => {
      expect(resolvePreviewConfig({ ...BASE, owner: '  alice  ' }).owner).toBe('alice');
    });

    it('falls back to "unknown" for empty string owner', () => {
      expect(resolvePreviewConfig({ ...BASE, owner: '' }).owner).toBe('unknown');
    });

    it('falls back to "unknown" for whitespace-only owner', () => {
      expect(resolvePreviewConfig({ ...BASE, owner: '   ' }).owner).toBe('unknown');
    });
  });

  describe('ttlHours', () => {
    it('defaults to 8 when ttlHours is omitted', () => {
      expect(resolvePreviewConfig(BASE).ttlHours).toBe(8);
    });

    it.each([1, 8, 24])('accepts ttlHours=%d', (ttlHours) => {
      expect(resolvePreviewConfig({ ...BASE, ttlHours }).ttlHours).toBe(ttlHours);
    });

    it.each([0, 25, -1, 0.5])('rejects ttlHours=%d', (ttlHours) => {
      expect(() => resolvePreviewConfig({ ...BASE, ttlHours })).toThrow(
        /Invalid ttlHours/,
      );
    });
  });

  describe('timestamps', () => {
    it('sets createdAt to now.toISOString()', () => {
      expect(resolvePreviewConfig(BASE).createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('sets expiresAt to createdAt + 8h (default ttl)', () => {
      expect(resolvePreviewConfig(BASE).expiresAt).toBe('2026-01-01T08:00:00.000Z');
    });

    it('sets expiresAt to createdAt + ttlHours', () => {
      expect(resolvePreviewConfig({ ...BASE, ttlHours: 1 }).expiresAt).toBe(
        '2026-01-01T01:00:00.000Z',
      );
    });

    it('uses a current timestamp when now is omitted', () => {
      const before = Date.now();
      const config = resolvePreviewConfig({ stage: 'pr-1' });
      const after = Date.now();
      const createdMs = new Date(config.createdAt).getTime();
      expect(createdMs).toBeGreaterThanOrEqual(before);
      expect(createdMs).toBeLessThanOrEqual(after);
    });

    it('does not mutate the input now', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const original = now.getTime();
      resolvePreviewConfig({ stage: 'pr-1', now });
      expect(now.getTime()).toBe(original);
    });
  });

  describe('stackPrefix', () => {
    it.each([
      ['pr-1', 'AgentraPreview-pr-1'],
      ['pr-307', 'AgentraPreview-pr-307'],
      ['sandbox-nakatsuka-202605282130', 'AgentraPreview-sandbox-nakatsuka-202605282130'],
      ['local-nakatsuka-a1b2c3d', 'AgentraPreview-local-nakatsuka-a1b2c3d'],
    ] as const)('stage=%s -> stackPrefix=%s', (stage, expected) => {
      expect(resolvePreviewConfig({ stage, now: NOW }).stackPrefix).toBe(expected);
    });
  });

  describe('tags', () => {
    it('includes all required tags', () => {
      const config = resolvePreviewConfig({
        stage: 'pr-1',
        owner: 'alice',
        source: 'github-actions',
        now: NOW,
      });
      expect(config.tags).toEqual({
        Project: 'Agentra',
        EnvironmentType: 'preview',
        Stage: 'pr-1',
        Owner: 'alice',
        Source: 'github-actions',
        ExpiresAt: '2026-01-01T08:00:00.000Z',
        CreatedBy: 'preview-cli',
        ManagedBy: 'cdk',
      });
    });

    it('tags.ExpiresAt matches config.expiresAt', () => {
      const config = resolvePreviewConfig({ ...BASE, ttlHours: 24 });
      expect(config.tags.ExpiresAt).toBe(config.expiresAt);
    });

    it('defaults Owner to "unknown"', () => {
      expect(resolvePreviewConfig(BASE).tags.Owner).toBe('unknown');
    });

    it('defaults Source to "human"', () => {
      expect(resolvePreviewConfig(BASE).tags.Source).toBe('human');
    });

    it('tags object is frozen', () => {
      const config = resolvePreviewConfig(BASE);
      expect(Object.isFrozen(config.tags)).toBe(true);
    });
  });

  it('propagates stage validation error', () => {
    expect(() => resolvePreviewConfig({ stage: 'dev' })).toThrow(/Invalid preview stage/);
  });
});

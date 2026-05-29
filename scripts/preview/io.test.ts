import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ensurePreviewDir } from './io.js';
import { previewDir } from './paths.js';

describe('ensurePreviewDir', () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'agentra-preview-io-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates the preview artifact directory when it does not exist', () => {
    const stage = 'local-test-abc1234';
    expect(existsSync(previewDir(stage))).toBe(false);

    const created = ensurePreviewDir(stage);

    expect(created).toBe(previewDir(stage));
    expect(existsSync(previewDir(stage))).toBe(true);
  });

  test('is idempotent when the directory already exists', () => {
    const stage = 'pr-42';
    ensurePreviewDir(stage);

    expect(() => ensurePreviewDir(stage)).not.toThrow();
    expect(existsSync(previewDir(stage))).toBe(true);
  });
});

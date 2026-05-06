import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalIconProvider, loadIconManifest } from '../icons/icon-provider.js';
import { buildIconPromptSection } from '../icons/prompts.js';
import { copyIconsToWorkspace, generateIconHelperSource } from '../icons/workspace.js';
import { buildAuthoringPrompt } from '../prompts.js';

// --- Manifest tests ---

describe('Icon manifest', () => {
  it('loads lucide-local manifest', () => {
    const manifest = loadIconManifest('lucide-local');
    expect(manifest.provider).toBe('lucide');
    expect(manifest.style).toBe('line');
    expect(manifest.license).toBe('ISC');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(10);
  });

  it('each icon has required fields', () => {
    const manifest = loadIconManifest('lucide-local');
    for (const icon of manifest.icons) {
      expect(icon.id).toBeTruthy();
      expect(icon.label).toBeTruthy();
      expect(icon.path).toBeTruthy();
      expect(icon.keywords.length).toBeGreaterThan(0);
    }
  });
});

// --- LocalIconProvider search tests ---

describe('LocalIconProvider', () => {
  const provider = new LocalIconProvider('lucide-local');

  it('search exact ID', () => {
    const results = provider.search({ query: 'factory' });
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('factory');
    expect(first?.score).toBeGreaterThanOrEqual(100);
  });

  it('search English keyword', () => {
    const results = provider.search({ query: 'risk' });
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('alert-triangle');
  });

  it('search Japanese keyword', () => {
    const results = provider.search({ query: '工場' });
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('factory');
  });

  it('search Japanese keyword — 改善', () => {
    const results = provider.search({ query: '改善' });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('trending-up');
  });

  it('unknown query returns empty list', () => {
    const results = provider.search({ query: 'xyznonexistent123' });
    expect(results).toEqual([]);
  });

  it('respects maxResults', () => {
    const results = provider.search({ query: 'chart', maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('resolve returns icon by id', () => {
    const icon = provider.resolve('trending-up');
    expect(icon).not.toBeNull();
    expect(icon?.id).toBe('trending-up');
    expect(icon?.provider).toBe('lucide-local');
  });

  it('resolve returns null for unknown id', () => {
    const icon = provider.resolve('nonexistent');
    expect(icon).toBeNull();
  });
});

// --- Workspace copy tests ---

describe('copyIconsToWorkspace', () => {
  const baseDir = join(tmpdir(), 'icon-test');
  let workDir: string;

  afterEach(async () => {
    try {
      await rm(baseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('copies default icons to workspace', async () => {
    workDir = join(baseDir, 'default-copy');
    await mkdir(workDir, { recursive: true });

    const result = await copyIconsToWorkspace({ workDir });

    expect(result.copiedIcons.length).toBeGreaterThanOrEqual(10);
    expect(result.warnings).toEqual([]);
    expect(existsSync(result.manifestPath)).toBe(true);

    // Check manifest is valid JSON
    const manifestJson = JSON.parse(readFileSync(result.manifestPath, 'utf-8'));
    expect(manifestJson.icons.length).toBe(result.copiedIcons.length);

    // Check helper was written
    const helperPath = join(workDir, 'helpers', 'icons.js');
    expect(existsSync(helperPath)).toBe(true);

    // Check SVG was copied
    const firstIcon = result.copiedIcons[0];
    if (!firstIcon) throw new Error('Expected at least one copied icon.');
    if (!firstIcon.workspacePath) throw new Error('Expected copied icon path.');
    const svgFile = join(workDir, 'assets', 'icons', firstIcon.workspacePath);
    expect(existsSync(svgFile)).toBe(true);

    // Check helper includes resvg runtime rendering
    const helperSource = readFileSync(helperPath, 'utf-8');
    expect(helperSource).toContain('Resvg');
    expect(helperSource).toContain('strokeColor');
  }, 30_000);

  it('copies preferred icons only', async () => {
    workDir = join(baseDir, 'preferred-copy');
    await mkdir(workDir, { recursive: true });

    const result = await copyIconsToWorkspace({
      workDir,
      iconIds: ['factory', 'trending-up'],
    });

    expect(result.copiedIcons.length).toBe(2);
    const ids = result.copiedIcons.map((i) => i.id);
    expect(ids).toContain('factory');
    expect(ids).toContain('trending-up');
    expect(result.warnings).toEqual([]);
  }, 15_000);

  it('missing preferred icon produces warning', async () => {
    workDir = join(baseDir, 'missing-copy');
    await mkdir(workDir, { recursive: true });

    const result = await copyIconsToWorkspace({
      workDir,
      iconIds: ['factory', 'nonexistent-icon'],
    });

    expect(result.copiedIcons.length).toBe(1);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('nonexistent-icon');
  });
});

// --- Helper source tests ---

describe('generateIconHelperSource', () => {
  it('generates valid CommonJS helper', () => {
    const source = generateIconHelperSource();
    expect(source).toContain('require("../assets/icons/manifest.json")');
    expect(source).toContain('function findIcon');
    expect(source).toContain('function addIcon');
    expect(source).toContain('module.exports');
  });
});

// --- Prompt injection tests ---

describe('Icon prompt section', () => {
  it('includes icon helper instructions when enabled', () => {
    const manifest = loadIconManifest('lucide-local');
    const section = buildIconPromptSection(manifest);
    expect(section).toContain('Icon Provider');
    expect(section).toContain('addIcon');
    expect(section).toContain('factory');
    expect(section).toContain('trending-up');
    expect(section).toContain('safe content area');
  });

  it('buildAuthoringPrompt includes icon section when manifest provided', () => {
    const manifest = loadIconManifest('lucide-local');
    const prompt = buildAuthoringPrompt(
      { prompt: 'テスト', language: 'ja' },
      { iconManifest: manifest },
    );
    expect(prompt).toContain('Icon Provider');
    expect(prompt).toContain('addIcon');
  });

  it('buildAuthoringPrompt omits icon section when no manifest', () => {
    const prompt = buildAuthoringPrompt({ prompt: 'テスト', language: 'ja' }, {});
    expect(prompt).not.toContain('Icon Provider');
    expect(prompt).not.toContain('addIcon');
  });
});

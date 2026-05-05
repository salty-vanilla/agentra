import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBrandFramePromptSection } from '../brand-frame/prompts.js';
import { DEFAULT_BRAND_FRAME_ID, loadBrandFrame } from '../brand-frame/registry.js';
import type { BrandFrame } from '../brand-frame/types.js';
import {
  copyBrandFrameToWorkspace,
  generateBrandFrameHelperSource,
} from '../brand-frame/workspace.js';
import { buildAuthoringPrompt } from '../prompts.js';

// --- Registry tests ---

describe('BrandFrame registry', () => {
  it('loads default BrandFrame', async () => {
    const frame = await loadBrandFrame();
    expect(frame.id).toBe(DEFAULT_BRAND_FRAME_ID);
    expect(frame.name).toBe('Company Basic v1');
    expect(frame.slideSize.width).toBe(13.334);
    expect(frame.slideSize.height).toBe(7.5);
    expect(frame.slideSize.layout).toBe('LAYOUT_WIDE');
    expect(frame.safeArea).toEqual({
      x: 0.5,
      y: 0.55,
      width: 12.33,
      height: 6.35,
    });
    expect(frame.header).toBeDefined();
    expect(frame.footer).toBeDefined();
    expect(frame.guidance).toBeInstanceOf(Array);
    expect(frame.guidance?.length).toBeGreaterThan(0);
  });

  it('loads BrandFrame by explicit ID', async () => {
    const frame = await loadBrandFrame('company-basic-v1');
    expect(frame.id).toBe('company-basic-v1');
  });

  it('falls back to default for unknown ID', async () => {
    const frame = await loadBrandFrame('nonexistent-template');
    expect(frame.id).toBe(DEFAULT_BRAND_FRAME_ID);
  });
});

// --- Workspace copy tests ---

describe('copyBrandFrameToWorkspace', () => {
  const workDirs: string[] = [];

  afterEach(async () => {
    for (const dir of workDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    workDirs.length = 0;
  });

  function makeWorkDir(): string {
    const dir = join(
      tmpdir(),
      `brand-frame-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    );
    workDirs.push(dir);
    return dir;
  }

  it('copies manifest and images to workspace', async () => {
    const workDir = makeWorkDir();
    await mkdir(workDir, { recursive: true });

    const result = await copyBrandFrameToWorkspace({ workDir });

    expect(result.brandFrame.id).toBe(DEFAULT_BRAND_FRAME_ID);
    expect(result.warnings).toHaveLength(0);

    // Verify manifest exists
    expect(existsSync(result.manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf-8'));
    expect(manifest.id).toBe('company-basic-v1');

    // Verify images exist
    const assetDir = result.workspaceAssetDir;
    expect(existsSync(join(assetDir, 'header.png'))).toBe(true);
    expect(existsSync(join(assetDir, 'footer.png'))).toBe(true);
  });

  it('writes brand-frame.js helper', async () => {
    const workDir = makeWorkDir();
    await mkdir(workDir, { recursive: true });

    await copyBrandFrameToWorkspace({ workDir });

    const helperPath = join(workDir, 'helpers', 'brand-frame.js');
    expect(existsSync(helperPath)).toBe(true);

    const helperSource = readFileSync(helperPath, 'utf-8');
    expect(helperSource).toContain('applyBrandFrame');
    expect(helperSource).toContain('getSafeArea');
    expect(helperSource).toContain('getSlideSize');
    expect(helperSource).toContain('manifest.json');
  });

  it('uses explicit brandFrameId', async () => {
    const workDir = makeWorkDir();
    await mkdir(workDir, { recursive: true });

    const result = await copyBrandFrameToWorkspace({
      workDir,
      brandFrameId: 'company-basic-v1',
    });

    expect(result.brandFrame.id).toBe('company-basic-v1');
  });
});

// --- Helper source tests ---

describe('generateBrandFrameHelperSource', () => {
  it('generates valid CommonJS module source', () => {
    const source = generateBrandFrameHelperSource();
    expect(source).toContain('"use strict"');
    expect(source).toContain('module.exports');
    expect(source).toContain('applyBrandFrame');
    expect(source).toContain('getSafeArea');
    expect(source).toContain('getSlideSize');
    expect(source).toContain('BRAND_FRAME');
  });
});

// --- Prompt tests ---

describe('buildBrandFramePromptSection', () => {
  const testFrame: BrandFrame = {
    id: 'test-frame',
    name: 'Test Frame',
    slideSize: { width: 13.333, height: 7.5, layout: 'LAYOUT_WIDE' },
    header: { imagePath: 'header.png', x: 0, y: 0, width: 13.333, height: 0.45 },
    footer: { imagePath: 'footer.png', x: 0, y: 7.05, width: 13.333, height: 0.45 },
    safeArea: { x: 0.65, y: 0.75, width: 12.03, height: 5.95 },
    guidance: ['Do not overlap header.', 'Use safe area.'],
  };

  it('includes header/footer/safeArea info', () => {
    const section = buildBrandFramePromptSection(testFrame);
    expect(section).toContain('Company Brand Frame');
    expect(section).toContain('width: 13.333in');
    expect(section).toContain('height: 7.5in');
    expect(section).toContain('Header bar');
    expect(section).toContain('Footer bar');
    expect(section).toContain('x=0.65');
    expect(section).toContain('w=12.03');
    expect(section).toContain('h=5.95');
  });

  it('includes guidance lines', () => {
    const section = buildBrandFramePromptSection(testFrame);
    expect(section).toContain('Do not overlap header.');
    expect(section).toContain('Use safe area.');
  });

  it('includes helper import instruction and per-slide rules', () => {
    const section = buildBrandFramePromptSection(testFrame);
    expect(section).toContain('require("./helpers/brand-frame")');
    expect(section).toContain('applyBrandFrame(slide, { pageNumber: slideIndex })');
    expect(section).toContain('header: false, footer: false');
    expect(section).toContain('WHITE');
  });
});

// --- Prompt integration test ---

describe('buildAuthoringPrompt with BrandFrame', () => {
  it('includes brand frame section when provided', () => {
    const frame: BrandFrame = {
      id: 'company-basic-v1',
      name: 'Company Basic v1',
      slideSize: { width: 13.333, height: 7.5, layout: 'LAYOUT_WIDE' },
      safeArea: { x: 0.65, y: 0.75, width: 12.03, height: 5.95 },
    };

    const prompt = buildAuthoringPrompt(
      { prompt: 'テスト資料を作って', language: 'ja' },
      { brandFrame: frame },
    );

    expect(prompt).toContain('Company Brand Frame');
    expect(prompt).toContain('Safe content area');
    expect(prompt).toContain('テスト資料を作って');
  });

  it('does not include brand frame section when not provided', () => {
    const prompt = buildAuthoringPrompt({
      prompt: 'テスト資料を作って',
      language: 'ja',
    });

    expect(prompt).not.toContain('Company Brand Frame');
    expect(prompt).toContain('テスト資料を作って');
  });
});

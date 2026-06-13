import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSdpmWorkspaceUploadItems, readSdpmWorkspace } from '../sdpm-workspace.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sdpm-ws-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

async function writeWorkspace(files: {
  deckJson?: unknown;
  brief?: string;
  outline?: string;
  artDirectionHtml?: string;
  slides?: Record<string, unknown>;
}): Promise<void> {
  if (files.deckJson !== undefined) {
    await writeFile(join(dir, 'deck.json'), JSON.stringify(files.deckJson));
  }
  await mkdir(join(dir, 'specs'), { recursive: true });
  if (files.brief !== undefined)
    await writeFile(join(dir, 'specs', 'brief.md'), files.brief);
  if (files.outline !== undefined)
    await writeFile(join(dir, 'specs', 'outline.md'), files.outline);
  if (files.artDirectionHtml !== undefined)
    await writeFile(join(dir, 'specs', 'art-direction.html'), files.artDirectionHtml);
  if (files.slides) {
    await mkdir(join(dir, 'slides'), { recursive: true });
    for (const [slug, json] of Object.entries(files.slides)) {
      await writeFile(join(dir, 'slides', `${slug}.json`), JSON.stringify(json));
    }
  }
}

describe('readSdpmWorkspace', () => {
  it('reads a full workspace and orders slides by outline', async () => {
    await writeWorkspace({
      deckJson: {
        template: 'blank-dark.pptx',
        fonts: { fullwidth: 'Meiryo', halfwidth: 'Calibri' },
        defaultTextColor: '#FFFFFF',
      },
      brief: '# Brief',
      outline: '- [intro] 目的\n- [summary] 行動\n',
      artDirectionHtml: '<html></html>',
      slides: {
        intro: { layout: 'Title Slide', placeholders: { '0': 'はじめに' } },
        summary: { layout: 'Blank', title: 'まとめ' },
      },
    });

    const ws = await readSdpmWorkspace(dir, { name: 'Spike', language: 'ja' });

    expect(ws.meta).toMatchObject({
      name: 'Spike',
      language: 'ja',
      template: 'blank-dark.pptx',
      defaultTextColor: '#FFFFFF',
    });
    expect(ws.files.briefPath).not.toBeNull();
    expect(ws.files.outlinePath).not.toBeNull();
    expect(ws.files.artDirectionPath).toMatch(/art-direction\.html$/);
    expect(ws.slides.map((s) => s.slug)).toEqual(['intro', 'summary']);
    expect(ws.slides[0]).toMatchObject({
      slug: 'intro',
      index: 1,
      title: 'はじめに',
      layout: 'Title Slide',
    });
    expect(ws.slides[1]).toMatchObject({ slug: 'summary', index: 2, title: 'まとめ' });
    expect(ws.warnings).toEqual([]);
  });

  it('degrades on a partial workspace (no deck.json, no outline)', async () => {
    await writeWorkspace({ brief: '# Brief' });
    const ws = await readSdpmWorkspace(dir);
    expect(ws.files.briefPath).not.toBeNull();
    expect(ws.files.deckJsonPath).toBeNull();
    expect(ws.slides).toEqual([]);
    expect(ws.warnings).toContain('deck.json not found');
    expect(ws.warnings).toContain('specs/outline.md not found');
  });

  it('warns and skips outline slugs whose slide JSON is missing', async () => {
    await writeWorkspace({
      deckJson: {},
      outline: '- [intro] a\n- [ghost] b\n',
      slides: { intro: { layout: 'X' } },
    });
    const ws = await readSdpmWorkspace(dir);
    expect(ws.slides.map((s) => s.slug)).toEqual(['intro']);
    expect(ws.warnings).toContain('slides/ghost.json missing for outline entry');
  });
});

describe('buildSdpmWorkspaceUploadItems', () => {
  it('builds deck.json (with injected name/language) + specs + slide json items', async () => {
    await writeWorkspace({
      deckJson: { template: 't.pptx', defaultTextColor: '#000' },
      brief: '# Brief',
      outline: '- [intro] a\n',
      artDirectionHtml: '<html></html>',
      slides: { intro: { layout: 'X' } },
    });
    const ws = await readSdpmWorkspace(dir, { name: 'Deck X', language: 'en' });
    const items = buildSdpmWorkspaceUploadItems('deck-9', ws);

    const byRole = Object.fromEntries(items.map((i) => [i.role, i]));
    expect(byRole['deck-json']?.key).toBe('decks/deck-9/deck.json');
    expect(byRole['deck-json']?.source).toMatchObject({ kind: 'inline' });
    const deckJson = JSON.parse((byRole['deck-json']?.source as { body: string }).body);
    expect(deckJson).toMatchObject({
      name: 'Deck X',
      language: 'en',
      template: 't.pptx',
    });

    expect(byRole['spec-brief']?.key).toBe('decks/deck-9/specs/brief.md');
    expect(byRole['spec-outline']?.key).toBe('decks/deck-9/specs/outline.md');
    expect(byRole['spec-art-direction']?.key).toBe(
      'decks/deck-9/specs/art-direction.html',
    );
    expect(byRole['slide-json']?.key).toBe('decks/deck-9/slides/intro.json');
    expect(byRole['slide-json']?.source).toMatchObject({ kind: 'file' });
  });

  it('omits absent spec files', async () => {
    await writeWorkspace({
      deckJson: {},
      outline: '- [intro] a\n',
      slides: { intro: {} },
    });
    const ws = await readSdpmWorkspace(dir);
    const items = buildSdpmWorkspaceUploadItems('deck-9', ws);
    const roles = items.map((i) => i.role);
    expect(roles).toContain('deck-json');
    expect(roles).toContain('spec-outline');
    expect(roles).toContain('slide-json');
    expect(roles).not.toContain('spec-brief');
    expect(roles).not.toContain('spec-art-direction');
  });

  it('rejects an unsafe deckId (defence in depth)', async () => {
    await writeWorkspace({ deckJson: {} });
    const ws = await readSdpmWorkspace(dir);
    expect(() => buildSdpmWorkspaceUploadItems('../evil', ws)).toThrow(/Unsafe/);
  });
});

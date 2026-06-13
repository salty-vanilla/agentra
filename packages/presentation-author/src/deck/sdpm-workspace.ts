// Adapted to read the SDPM Skill (aws-samples/sample-spec-driven-presentation-maker, MIT-0)
// Deck Workspace layout. Bridges an on-disk SDPM workspace into Agentra's
// `decks/{deckId}/...` S3 layout (Epic #442 / #446).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DECK_PREFIX } from '@agentra/shared';
import type { PresentationLanguage } from '../types.js';
import type { DeckUploadItem } from './workspace.js';

const JSON_CONTENT_TYPE = 'application/json';
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new Error(`Unsafe ${label} for S3 key: ${JSON.stringify(value)}`);
  }
}

function deckKey(deckId: string, rel: string): string {
  return `${DECK_PREFIX}/${deckId}/${rel}`;
}

/** A single SDPM slide spec discovered in the workspace. */
export interface SdpmWorkspaceSlide {
  slug: string;
  /** 1-based order (outline order first, then leftover slide files). */
  index: number;
  /** Absolute path to `slides/{slug}.json`. */
  jsonPath: string;
  title: string | null;
  layout: string | null;
}

/** Resolved on-disk paths for the SDPM workspace files (null when absent). */
export interface SdpmWorkspaceFiles {
  deckJsonPath: string | null;
  briefPath: string | null;
  outlinePath: string | null;
  artDirectionPath: string | null;
}

/** Deck metadata normalized from `deck.json` (+ injected name/language). */
export interface SdpmWorkspaceMeta {
  name: string;
  language: PresentationLanguage;
  template: string | null;
  fonts: { fullwidth?: string; halfwidth?: string } | null;
  defaultTextColor: string | null;
}

export interface SdpmWorkspace {
  dir: string;
  meta: SdpmWorkspaceMeta;
  files: SdpmWorkspaceFiles;
  slides: SdpmWorkspaceSlide[];
  warnings: string[];
}

export interface ReadSdpmWorkspaceOptions {
  /** Presentation name (SDPM `deck.json` has no name field). */
  name?: string | undefined;
  language?: PresentationLanguage | undefined;
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  return (await readFileOrNull(path)) !== null;
}

/** Parse `- [slug] message` lines into ordered slugs (SDPM outline.md). */
function parseOutlineSlugs(outline: string): string[] {
  const pattern = /^-\s*\[([a-z0-9-]+)\]/;
  const slugs: string[] = [];
  for (const line of outline.split('\n')) {
    const match = line.trim().match(pattern);
    if (match) slugs.push(match[1] as string);
  }
  return slugs;
}

function slideTitle(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  if (typeof json.title === 'string' && json.title.length > 0) return json.title;
  const placeholders = json.placeholders;
  if (placeholders && typeof placeholders === 'object') {
    const first = (placeholders as Record<string, unknown>)['0'];
    if (typeof first === 'string' && first.length > 0) return first;
  }
  return null;
}

function parseJsonOrNull(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Read an on-disk SDPM Deck Workspace into a normalized structure. Degrades on
 * a missing or partial workspace (records warnings, never throws on missing
 * files). Slide order follows `specs/outline.md`; slide JSON files not listed in
 * the outline are appended in lexical order.
 */
export async function readSdpmWorkspace(
  dir: string,
  options: ReadSdpmWorkspaceOptions = {},
): Promise<SdpmWorkspace> {
  const warnings: string[] = [];

  const deckJsonPath = join(dir, 'deck.json');
  const deckJsonText = await readFileOrNull(deckJsonPath);
  if (!deckJsonText) warnings.push('deck.json not found');
  const deckJson = parseJsonOrNull(deckJsonText) ?? {};

  const fonts =
    deckJson.fonts && typeof deckJson.fonts === 'object'
      ? (deckJson.fonts as { fullwidth?: string; halfwidth?: string })
      : null;

  const meta: SdpmWorkspaceMeta = {
    name: options.name ?? (typeof deckJson.name === 'string' ? deckJson.name : ''),
    language: options.language ?? (deckJson.language === 'en' ? 'en' : 'ja'),
    template: typeof deckJson.template === 'string' ? deckJson.template : null,
    fonts,
    defaultTextColor:
      typeof deckJson.defaultTextColor === 'string' ? deckJson.defaultTextColor : null,
  };

  const briefPath = join(dir, 'specs', 'brief.md');
  const outlinePath = join(dir, 'specs', 'outline.md');
  const artDirectionHtml = join(dir, 'specs', 'art-direction.html');
  const artDirectionMd = join(dir, 'specs', 'art-direction.md');

  const [hasBrief, outlineText, hasArtHtml, hasArtMd] = await Promise.all([
    fileExists(briefPath),
    readFileOrNull(outlinePath),
    fileExists(artDirectionHtml),
    fileExists(artDirectionMd),
  ]);

  const files: SdpmWorkspaceFiles = {
    deckJsonPath: deckJsonText ? deckJsonPath : null,
    briefPath: hasBrief ? briefPath : null,
    outlinePath: outlineText !== null ? outlinePath : null,
    artDirectionPath: hasArtHtml ? artDirectionHtml : hasArtMd ? artDirectionMd : null,
  };

  const orderedSlugs = outlineText ? parseOutlineSlugs(outlineText) : [];
  if (!outlineText) warnings.push('specs/outline.md not found');

  const slides: SdpmWorkspaceSlide[] = [];
  const seen = new Set<string>();
  let index = 1;
  for (const slug of orderedSlugs) {
    if (seen.has(slug)) continue;
    const jsonPath = join(dir, 'slides', `${slug}.json`);
    const json = parseJsonOrNull(await readFileOrNull(jsonPath));
    if (!json) {
      warnings.push(`slides/${slug}.json missing for outline entry`);
      continue;
    }
    seen.add(slug);
    slides.push({
      slug,
      index: index++,
      jsonPath,
      title: slideTitle(json),
      layout: typeof json.layout === 'string' ? json.layout : null,
    });
  }

  return { dir, meta, files, slides, warnings };
}

/**
 * Build the additive S3 upload items for an SDPM workspace, targeting
 * `decks/{deckId}/...`. `deck.json` is re-serialized with `name`/`language`
 * injected so the BFF snapshot (which reads them from deck.json) works, mirroring
 * the agentra-pptxgenjs deck-store. Pure — no I/O; throws only on an unsafe key
 * segment (defence in depth).
 */
export function buildSdpmWorkspaceUploadItems(
  deckId: string,
  workspace: SdpmWorkspace,
): DeckUploadItem[] {
  assertSafeSegment(deckId, 'deckId');
  for (const slide of workspace.slides) assertSafeSegment(slide.slug, 'slug');

  const items: DeckUploadItem[] = [];

  const deckJsonBody = JSON.stringify({
    template: workspace.meta.template,
    fonts: workspace.meta.fonts,
    defaultTextColor: workspace.meta.defaultTextColor,
    name: workspace.meta.name,
    language: workspace.meta.language,
  });
  items.push({
    key: deckKey(deckId, 'deck.json'),
    contentType: JSON_CONTENT_TYPE,
    source: { kind: 'inline', body: deckJsonBody },
    role: 'deck-json',
  });

  if (workspace.files.briefPath) {
    items.push({
      key: deckKey(deckId, 'specs/brief.md'),
      contentType: MARKDOWN_CONTENT_TYPE,
      source: { kind: 'file', localPath: workspace.files.briefPath },
      role: 'spec-brief',
    });
  }
  if (workspace.files.outlinePath) {
    items.push({
      key: deckKey(deckId, 'specs/outline.md'),
      contentType: MARKDOWN_CONTENT_TYPE,
      source: { kind: 'file', localPath: workspace.files.outlinePath },
      role: 'spec-outline',
    });
  }
  if (workspace.files.artDirectionPath) {
    const isHtml = workspace.files.artDirectionPath.endsWith('.html');
    items.push({
      key: deckKey(
        deckId,
        isHtml ? 'specs/art-direction.html' : 'specs/art-direction.md',
      ),
      contentType: isHtml ? HTML_CONTENT_TYPE : MARKDOWN_CONTENT_TYPE,
      source: { kind: 'file', localPath: workspace.files.artDirectionPath },
      role: 'spec-art-direction',
    });
  }

  for (const slide of workspace.slides) {
    items.push({
      key: deckKey(deckId, `slides/${slide.slug}.json`),
      contentType: JSON_CONTENT_TYPE,
      source: { kind: 'file', localPath: slide.jsonPath },
      role: 'slide-json',
      slug: slide.slug,
    });
  }

  return items;
}

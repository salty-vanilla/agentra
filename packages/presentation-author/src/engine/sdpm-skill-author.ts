import type { PresentationAuthorDeps, PresentationAuthorInput } from '../types.js';
import type { SdpmWorkspaceSpec } from './sdpm-skill-runner.js';

/** Authors an SDPM Deck Workspace spec from a prompt. Injectable for tests. */
export type AuthorSdpmWorkspaceFn = (
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
) => Promise<SdpmWorkspaceSpec>;

const DEFAULT_TEMPLATE = 'blank-dark.pptx';

function buildAuthoringPrompt(input: PresentationAuthorInput): string {
  const language = input.language ?? 'ja';
  return [
    'You are authoring a presentation as an SDPM Deck Workspace.',
    'Return ONLY a single JSON object (no markdown fence) with this shape:',
    '{',
    '  "deck": {"template": "blank-dark.pptx", "fonts": {"fullwidth": "Meiryo", "halfwidth": "Calibri"}, "defaultTextColor": "#FFFFFF"},',
    '  "brief": "one paragraph brief",',
    '  "slides": [',
    '    {"slug": "intro", "message": "what this slide changes in the audience",',
    '     "json": {"layout": "Blank", "notes": "speaker notes",',
    '       "elements": [{"type": "textbox", "x": 100, "y": 200, "width": 1720, "height": 200, "fontSize": 48, "text": "Title"}]}}',
    '  ]',
    '}',
    'Rules: slug is lowercase a-z0-9 with dashes; one slide = one message;',
    'coordinates are in px on a 1920x1080 canvas; keep 3-6 slides unless asked otherwise.',
    `Write all visible text in ${language === 'en' ? 'English' : 'Japanese'}.`,
    '',
    `User request:\n${input.prompt}`,
  ].join('\n');
}

/** Extract the first balanced top-level JSON object from arbitrary LLM output. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function coerceSpec(raw: unknown): SdpmWorkspaceSpec {
  if (!raw || typeof raw !== 'object') {
    throw new Error('SDPM authoring did not return a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const deck =
    obj.deck && typeof obj.deck === 'object'
      ? (obj.deck as Record<string, unknown>)
      : { template: DEFAULT_TEMPLATE };
  const slidesRaw = Array.isArray(obj.slides) ? obj.slides : [];
  const slides = slidesRaw
    .map((s) => {
      const slide = s as Record<string, unknown>;
      const slug = typeof slide.slug === 'string' ? slide.slug : '';
      const json =
        slide.json && typeof slide.json === 'object'
          ? (slide.json as Record<string, unknown>)
          : {};
      return {
        slug,
        message: typeof slide.message === 'string' ? slide.message : '',
        json,
      };
    })
    .filter((s) => /^[a-z0-9-]+$/.test(s.slug));

  if (slides.length === 0) {
    throw new Error('SDPM authoring returned no valid slides');
  }

  return {
    deck,
    brief: typeof obj.brief === 'string' ? obj.brief : undefined,
    artDirectionHtml:
      typeof obj.artDirectionHtml === 'string' ? obj.artDirectionHtml : undefined,
    slides,
  };
}

/**
 * Default SDPM authoring: a single LLM call that emits the Deck Workspace as
 * JSON, parsed into an {@link SdpmWorkspaceSpec}. Intentionally minimal (MVP);
 * the SDPM references/design-guide authoring loop is a follow-up.
 */
export async function authorSdpmWorkspace(
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
): Promise<SdpmWorkspaceSpec> {
  const output = await deps.llm.converse({
    prompt: buildAuthoringPrompt(input),
  });
  const json = extractJsonObject(output);
  if (!json) throw new Error('SDPM authoring output contained no JSON object');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `SDPM authoring output was not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return coerceSpec(parsed);
}

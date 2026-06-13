import { describe, expect, it, vi } from 'vitest';
import type { LlmClient, PresentationAuthorDeps } from '../../types.js';
import { authorSdpmWorkspace } from '../sdpm-skill-author.js';

function deps(response: string): PresentationAuthorDeps {
  const llm: LlmClient = { converse: vi.fn(async () => response) };
  return { llm };
}

const VALID = JSON.stringify({
  deck: { template: 'blank-dark.pptx' },
  brief: 'a brief',
  slides: [
    { slug: 'intro', message: '目的', json: { layout: 'Blank', elements: [] } },
    { slug: 'summary', message: '行動', json: { layout: 'Blank' } },
  ],
});

describe('authorSdpmWorkspace', () => {
  it('parses a clean JSON object into a workspace spec', async () => {
    const spec = await authorSdpmWorkspace({ prompt: 'p', language: 'ja' }, deps(VALID));
    expect(spec.deck).toMatchObject({ template: 'blank-dark.pptx' });
    expect(spec.brief).toBe('a brief');
    expect(spec.slides.map((s) => s.slug)).toEqual(['intro', 'summary']);
  });

  it('extracts JSON even when wrapped in prose / fences', async () => {
    const wrapped = `Sure, here it is:\n\`\`\`json\n${VALID}\n\`\`\`\nDone.`;
    const spec = await authorSdpmWorkspace({ prompt: 'p' }, deps(wrapped));
    expect(spec.slides).toHaveLength(2);
  });

  it('drops slides with invalid slugs', async () => {
    const dirty = JSON.stringify({
      deck: {},
      slides: [
        { slug: 'OK bad slug', message: 'm', json: {} },
        { slug: 'good', message: 'm', json: {} },
      ],
    });
    const spec = await authorSdpmWorkspace({ prompt: 'p' }, deps(dirty));
    expect(spec.slides.map((s) => s.slug)).toEqual(['good']);
  });

  it('throws when no JSON object is present', async () => {
    await expect(
      authorSdpmWorkspace({ prompt: 'p' }, deps('no json here')),
    ).rejects.toThrow(/no JSON object/);
  });

  it('throws when there are no valid slides', async () => {
    const empty = JSON.stringify({ deck: {}, slides: [] });
    await expect(authorSdpmWorkspace({ prompt: 'p' }, deps(empty))).rejects.toThrow(
      /no valid slides/,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { resolvePresentationAuthorEngine } from '../resolve-engine.js';
import { UnknownPresentationAuthorEngineError } from '../types.js';

describe('resolvePresentationAuthorEngine', () => {
  it('defaults to agentra-pptxgenjs when nothing is set', () => {
    expect(resolvePresentationAuthorEngine(undefined, {})).toBe('agentra-pptxgenjs');
  });

  it('treats empty / whitespace as unset and falls back to default', () => {
    expect(resolvePresentationAuthorEngine('   ', {})).toBe('agentra-pptxgenjs');
    expect(
      resolvePresentationAuthorEngine(undefined, { PRESENTATION_AUTHOR_ENGINE: '  ' }),
    ).toBe('agentra-pptxgenjs');
  });

  it('reads the engine from the environment variable', () => {
    expect(
      resolvePresentationAuthorEngine(undefined, {
        PRESENTATION_AUTHOR_ENGINE: 'sdpm-skill',
      }),
    ).toBe('sdpm-skill');
  });

  it('prefers the explicit argument over the environment variable', () => {
    expect(
      resolvePresentationAuthorEngine('agentra-pptxgenjs', {
        PRESENTATION_AUTHOR_ENGINE: 'sdpm-skill',
      }),
    ).toBe('agentra-pptxgenjs');
  });

  it('trims valid explicit values', () => {
    expect(resolvePresentationAuthorEngine(' sdpm-skill ', {})).toBe('sdpm-skill');
  });

  it('throws on an unknown explicit engine', () => {
    expect(() => resolvePresentationAuthorEngine('totally-made-up', {})).toThrow(
      UnknownPresentationAuthorEngineError,
    );
  });

  it('throws on an unknown env engine', () => {
    expect(() =>
      resolvePresentationAuthorEngine(undefined, {
        PRESENTATION_AUTHOR_ENGINE: 'nope',
      }),
    ).toThrow(UnknownPresentationAuthorEngineError);
  });
});

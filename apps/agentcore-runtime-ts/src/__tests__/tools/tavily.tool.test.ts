import { describe, expect, it } from 'vitest';

describe('resolveMaxResults', () => {
  it('defaults to 5 when max_results is undefined', async () => {
    const { resolveMaxResults } = await import('../../tools/tavily.js');
    expect(resolveMaxResults(undefined)).toBe(5);
  });

  it('caps values above 5 to 5', async () => {
    const { resolveMaxResults } = await import('../../tools/tavily.js');
    expect(resolveMaxResults(10)).toBe(5);
    expect(resolveMaxResults(8)).toBe(5);
    expect(resolveMaxResults(6)).toBe(5);
  });

  it('preserves values at or below 5', async () => {
    const { resolveMaxResults } = await import('../../tools/tavily.js');
    expect(resolveMaxResults(5)).toBe(5);
    expect(resolveMaxResults(3)).toBe(3);
    expect(resolveMaxResults(1)).toBe(1);
  });
});

describe('boundTavilyPayload', () => {
  it('passes through small payloads unchanged', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    const data = {
      query: 'test',
      answer: 'short answer',
      results: [
        {
          title: 'Result',
          url: 'https://example.com',
          content: 'small content',
          score: 0.9,
        },
      ],
    };

    const bounded = boundTavilyPayload(data);
    expect(bounded).toEqual(data);
  });

  it('truncates content fields that exceed MAX_CONTENT_CHARS (5000)', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    const longContent = 'x'.repeat(6000);
    const data = {
      results: [
        { title: 'Result', url: 'https://example.com', content: longContent, score: 0.9 },
      ],
    };

    const bounded = boundTavilyPayload(data) as { results: Array<{ content: string }> };
    expect(bounded.results[0].content.length).toBeLessThan(longContent.length);
    expect(bounded.results[0].content).toMatch(/\[truncated\]$/);
  });

  it('truncates raw_content fields that exceed MAX_CONTENT_CHARS (5000)', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    const longRawContent = 'y'.repeat(8000);
    const data = {
      results: [
        { title: 'Result', url: 'https://example.com', raw_content: longRawContent },
      ],
    };

    const bounded = boundTavilyPayload(data) as {
      results: Array<{ raw_content: string }>;
    };
    expect(bounded.results[0].raw_content.length).toBeLessThan(longRawContent.length);
    expect(bounded.results[0].raw_content).toMatch(/\[truncated\]$/);
  });

  it('truncates answer fields that exceed MAX_ANSWER_CHARS (2000)', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    const longAnswer = 'a'.repeat(3000);
    const data = { answer: longAnswer, results: [] };

    const bounded = boundTavilyPayload(data) as { answer: string };
    expect(bounded.answer.length).toBeLessThan(longAnswer.length);
    expect(bounded.answer).toMatch(/\[truncated\]$/);
  });

  it('preserves other result fields when truncating content', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    const data = {
      results: [
        {
          title: 'Result Title',
          url: 'https://example.com',
          score: 0.95,
          content: 'z'.repeat(6000),
        },
      ],
    };

    const bounded = boundTavilyPayload(data) as {
      results: Array<{ title: string; url: string; score: number; content: string }>;
    };
    expect(bounded.results[0].title).toBe('Result Title');
    expect(bounded.results[0].url).toBe('https://example.com');
    expect(bounded.results[0].score).toBe(0.95);
  });

  it('returns non-object values unchanged', async () => {
    const { boundTavilyPayload } = await import('../../tools/tavily.js');

    expect(boundTavilyPayload(null)).toBeNull();
    expect(boundTavilyPayload('string')).toBe('string');
    expect(boundTavilyPayload(42)).toBe(42);
  });
});

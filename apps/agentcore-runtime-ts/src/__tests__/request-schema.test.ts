import { describe, expect, it } from 'vitest';
import { RequestSchema } from '../request-schema.js';

describe('RequestSchema', () => {
  it('accepts a requestId when provided', () => {
    const parsed = RequestSchema.parse({
      prompt: 'Hello',
      requestId: 'req-abc-123',
    });

    expect(parsed.requestId).toBe('req-abc-123');
  });

  it('leaves requestId undefined when not provided', () => {
    const parsed = RequestSchema.parse({ prompt: 'Hello' });

    expect(parsed.requestId).toBeUndefined();
  });

  it('rejects an empty requestId string', () => {
    const result = RequestSchema.safeParse({
      prompt: 'Hello',
      requestId: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('trims surrounding whitespace from requestId', () => {
    const parsed = RequestSchema.parse({
      prompt: 'Hello',
      requestId: '  req-xyz  ',
    });

    expect(parsed.requestId).toBe('req-xyz');
  });
});

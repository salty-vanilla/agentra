import { describe, expect, it } from 'vitest';
import { buildRuntimePayload, getModelId } from '../lib/bedrock-agent.js';

describe('buildRuntimePayload', () => {
  it('includes model key and prompt in payload', () => {
    const payload = buildRuntimePayload('opus', 'thread-1', 'Hello');

    expect(payload.model).toBe('opus');
    expect(payload.prompt).toBe('Hello');
    expect(payload.threadId).toBe('thread-1');
  });

  it('includes commandDirective as a separate field when provided', () => {
    const directive = '<UI command directive>test</UI command directive>';
    const payload = buildRuntimePayload(
      'sonnet',
      'thread-1',
      'Create slides',
      undefined,
      {
        commandDirective: directive,
      },
    );

    expect(payload.commandDirective).toBe(directive);
  });

  it('omits commandDirective when not provided', () => {
    const payload = buildRuntimePayload('sonnet', 'thread-1', 'Hello');

    expect(Object.keys(payload)).not.toContain('commandDirective');
  });

  it('does not embed command text in the prompt field', () => {
    const payload = buildRuntimePayload(
      'sonnet',
      'thread-1',
      'Create slides',
      undefined,
      {
        commandDirective: 'some directive text',
      },
    );

    expect(payload.prompt).toBe('Create slides');
    expect(String(payload.prompt)).not.toContain('directive');
  });

  it('includes userId when provided', () => {
    const payload = buildRuntimePayload('haiku', 'thread-2', 'Hi', 'trace-1', {
      userId: 'user-abc',
    });

    expect(payload.userId).toBe('user-abc');
  });

  it('includes traceId when provided', () => {
    const payload = buildRuntimePayload('sonnet', 'thread-3', 'Hi', 'trace-xyz');

    expect(payload.traceId).toBe('trace-xyz');
  });

  it('omits traceId when not provided', () => {
    const payload = buildRuntimePayload('sonnet', 'thread-1', 'Hi');

    expect(Object.keys(payload)).not.toContain('traceId');
  });

  it('includes requestId when provided', () => {
    const payload = buildRuntimePayload('sonnet', 'thread-1', 'Hi', 'trace-1', {
      requestId: 'req-abc',
    });

    expect(payload.requestId).toBe('req-abc');
  });

  it('omits requestId when not provided', () => {
    const payload = buildRuntimePayload('sonnet', 'thread-1', 'Hi', 'trace-1', {
      userId: 'user-abc',
    });

    expect(Object.keys(payload)).not.toContain('requestId');
  });

  it('sends all three model keys correctly', () => {
    for (const model of ['opus', 'sonnet', 'haiku'] as const) {
      const payload = buildRuntimePayload(model, 'thread-1', 'Hello');
      expect(payload.model).toBe(model);
    }
  });
});

describe('getModelId', () => {
  it('returns a model ID containing "opus" for the opus key', () => {
    expect(getModelId('opus')).toContain('opus');
  });

  it('returns a model ID containing "sonnet" for the sonnet key', () => {
    expect(getModelId('sonnet')).toContain('sonnet');
  });

  it('returns a model ID containing "haiku" for the haiku key', () => {
    expect(getModelId('haiku')).toContain('haiku');
  });

  it('returns distinct model IDs for each key', () => {
    const ids = new Set(
      ['opus', 'sonnet', 'haiku'].map((k) =>
        getModelId(k as 'opus' | 'sonnet' | 'haiku'),
      ),
    );
    expect(ids.size).toBe(3);
  });
});

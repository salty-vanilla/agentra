import { describe, expect, it } from 'vitest';
import { createBrief, mergeBriefs } from './brief-builder.js';

describe('createBrief', () => {
  it('fills id and createdAt and deduplicates arrays', () => {
    const brief = createBrief({
      idHint: 'brief-1',
      createdAt: '2024-02-01T00:00:00.000Z',
      language: 'ja',
      audience: 'executive',
      outputFormat: 'presentation',
      topic: '  Quarterly Review  ',
      goal: ' Align on next steps ',
      constraints: ['one', '', 'one', 'two'],
      keyFacts: ['A', 'A', ''],
      openQuestions: ['Q1', 'Q1'],
      sourceIds: ['s1', '', 's2', 's1'],
      metadata: { team: 'sales' },
    });

    expect(brief).toMatchObject({
      id: 'brief-1',
      createdAt: '2024-02-01T00:00:00.000Z',
      language: 'ja',
      audience: 'executive',
      outputFormat: 'presentation',
      topic: 'Quarterly Review',
      goal: 'Align on next steps',
      constraints: ['one', 'two'],
      keyFacts: ['A'],
      openQuestions: ['Q1'],
      sourceIds: ['s1', 's2'],
      metadata: { team: 'sales' },
    });
  });
});

describe('mergeBriefs', () => {
  it('merges arrays and metadata without changing id or createdAt', () => {
    const base = createBrief({
      idHint: 'base',
      createdAt: '2024-01-01T00:00:00.000Z',
      audience: 'general',
      topic: 'Base topic',
      constraints: ['one'],
      keyFacts: ['fact-a'],
      sourceIds: ['s1'],
      metadata: { base: true, shared: 'old' },
    });

    const merged = mergeBriefs(base, {
      audience: 'engineer',
      topic: '  Updated topic ',
      constraints: ['one', 'two'],
      keyFacts: ['fact-b', 'fact-a'],
      sourceIds: ['s2', 's1'],
      metadata: { shared: 'new', patch: true },
    });

    expect(merged.id).toBe('base');
    expect(merged.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(merged).toMatchObject({
      audience: 'engineer',
      topic: 'Updated topic',
      constraints: ['one', 'two'],
      keyFacts: ['fact-a', 'fact-b'],
      sourceIds: ['s1', 's2'],
      metadata: { base: true, shared: 'new', patch: true },
    });
  });
});

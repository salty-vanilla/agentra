import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('brief tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a normalized brief with ids and timestamps', async () => {
    const { executeCreateBriefTool } = await import('../../tools/brief.tool.js');

    const response = executeCreateBriefTool({
      language: 'ja',
      audience: 'executive',
      outputFormat: 'presentation',
      topic: '  Launch plan  ',
      goal: ' Align the team ',
      constraints: ['one', '', 'one', 'two'],
      keyFacts: ['A', 'A', ''],
      openQuestions: ['Q1', 'Q1'],
      sourceIds: ['s1', '', 's2', 's1'],
      metadata: { stage: 'draft' },
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.id).toMatch(/^brief-/);
    expect(payload.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload).toMatchObject({
      language: 'ja',
      audience: 'executive',
      outputFormat: 'presentation',
      topic: 'Launch plan',
      goal: 'Align the team',
      constraints: ['one', 'two'],
      keyFacts: ['A'],
      openQuestions: ['Q1'],
      sourceIds: ['s1', 's2'],
      metadata: { stage: 'draft' },
    });
  });

  it('rejects oversized brief input without throwing', async () => {
    const { executeCreateBriefTool } = await import('../../tools/brief.tool.js');

    const tooManyItems = Array.from({ length: 101 }, (_, index) => `item-${index}`);

    const tooManyConstraints = executeCreateBriefTool({
      constraints: tooManyItems,
    });
    expect(tooManyConstraints.status).toBe('error');
    expect(tooManyConstraints.content[0]?.text).toContain(
      'constraints must not exceed 100 items',
    );

    const tooLongTopic = executeCreateBriefTool({
      topic: 'x'.repeat(4001),
    });
    expect(tooLongTopic.status).toBe('error');
    expect(tooLongTopic.content[0]?.text).toContain(
      'topic must not exceed 4000 characters',
    );

    const tooLongGoal = executeCreateBriefTool({
      goal: 'x'.repeat(4001),
    });
    expect(tooLongGoal.status).toBe('error');
    expect(tooLongGoal.content[0]?.text).toContain(
      'goal must not exceed 4000 characters',
    );

    const tooManyMetadataKeys = executeCreateBriefTool({
      metadata: Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [`k${index}`, index]),
      ),
    });
    expect(tooManyMetadataKeys.status).toBe('error');
    expect(tooManyMetadataKeys.content[0]?.text).toContain(
      'metadata must not exceed 100 keys',
    );
  });

  it('merges briefs without changing id or createdAt', async () => {
    const { executeCreateBriefTool, executeMergeBriefsTool } = await import(
      '../../tools/brief.tool.js'
    );

    const baseResponse = executeCreateBriefTool({
      idHint: 'base-brief',
      createdAt: '2024-01-01T00:00:00.000Z',
      topic: 'Base topic',
      constraints: ['one'],
      keyFacts: ['fact-a'],
      sourceIds: ['s1'],
      metadata: { base: true, shared: 'old' },
    });

    expect(baseResponse.status).toBe('success');
    const base = JSON.parse(baseResponse.content[0]?.text ?? '{}');

    const mergedResponse = executeMergeBriefsTool({
      base,
      patch: {
        audience: 'engineer',
        topic: ' Updated topic ',
        constraints: ['one', 'two'],
        keyFacts: ['fact-b', 'fact-a'],
        sourceIds: ['s2', 's1'],
        metadata: { shared: 'new', patch: true },
      },
    });

    expect(mergedResponse.status).toBe('success');

    const merged = JSON.parse(mergedResponse.content[0]?.text ?? '{}');
    expect(merged.id).toBe('base-brief');
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

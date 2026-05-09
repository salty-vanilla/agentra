import { describe, expect, it } from 'vitest';

describe('kb query planning', () => {
  it.each([
    ['how to reset a device', 'how_to'],
    ['error code and failure symptoms', 'troubleshooting'],
    ['policy and rule lookup', 'policy_lookup'],
    ['spec and API details', 'spec_lookup'],
    ['compare line A and line B', 'comparison'],
    ['summary of the incident report', 'summary'],
  ])('infers %s as %s', async (query, intent) => {
    const { createKbQueryPlan } = await import('../../rag/kb-query-planning.js');

    const plan = createKbQueryPlan({ query });

    expect(plan.intent).toBe(intent);
    expect(plan.metadata).toMatchObject({
      planner: 'deterministic-kb-query-planner',
    });
  });

  it('defaults topK to 5', async () => {
    const { createKbQueryPlan } = await import('../../rag/kb-query-planning.js');

    const plan = createKbQueryPlan({ query: 'document about maintenance' });

    expect(plan.topK).toBe(5);
  });

  it('rejects queries longer than 2000 characters', async () => {
    const { createKbQueryPlan } = await import('../../rag/kb-query-planning.js');

    expect(() =>
      createKbQueryPlan({
        query: 'a'.repeat(2001),
      }),
    ).toThrow('query must not exceed 2000 characters');
  });
});

import { describe, expect, test } from 'vitest';
import {
  filterPreviewCandidates,
  parseDescribeStacksOutput,
} from './list-preview-stacks.js';

describe('parseDescribeStacksOutput', () => {
  test('maps the Tags array to a Record and keeps stack names', () => {
    const json = JSON.stringify({
      Stacks: [
        {
          StackName: 'AgentraPreview-pr-123-Backend',
          Tags: [
            { Key: 'Project', Value: 'Agentra' },
            { Key: 'Stage', Value: 'pr-123' },
          ],
        },
      ],
    });

    const candidates = parseDescribeStacksOutput(json);

    expect(candidates).toEqual([
      {
        stackName: 'AgentraPreview-pr-123-Backend',
        tags: { Project: 'Agentra', Stage: 'pr-123' },
      },
    ]);
  });

  test('handles stacks without tags and skips entries without a name', () => {
    const json = JSON.stringify({
      Stacks: [{ StackName: 'AgentraPreview-pr-1-Data' }, { Tags: [] }],
    });

    const candidates = parseDescribeStacksOutput(json);

    expect(candidates).toEqual([{ stackName: 'AgentraPreview-pr-1-Data', tags: {} }]);
  });

  test('returns an empty array when there are no stacks', () => {
    expect(parseDescribeStacksOutput(JSON.stringify({}))).toEqual([]);
  });

  test('throws on invalid JSON', () => {
    expect(() => parseDescribeStacksOutput('not json')).toThrow(/Could not parse/);
  });
});

describe('filterPreviewCandidates', () => {
  test('keeps only stacks under the broad AgentraPreview- namespace', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-123-Backend', tags: {} },
      { stackName: 'AgentraProd-Backend', tags: {} },
      { stackName: 'AgentraPreview-local-foo-aaaaaaa-Data', tags: {} },
      { stackName: 'SomethingElse', tags: {} },
    ];

    const filtered = filterPreviewCandidates(candidates);

    expect(filtered.map((c) => c.stackName)).toEqual([
      'AgentraPreview-pr-123-Backend',
      'AgentraPreview-local-foo-aaaaaaa-Data',
    ]);
  });
});

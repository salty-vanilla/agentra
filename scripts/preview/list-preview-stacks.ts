/**
 * Pure parsing/filtering of `aws cloudformation describe-stacks` output into the
 * `CandidateStack` shape the destroy guard consumes. No AWS or process access;
 * the side-effecting `describePreviewCandidates` lives in cli-runtime.ts.
 */
import type { CandidateStack } from './validate-destroy-target.js';

/** Broad preview namespace used to pre-filter candidates before stage validation. */
export const PREVIEW_NAMESPACE_PREFIX = 'AgentraPreview-';

interface DescribeStacksTag {
  Key?: string;
  Value?: string;
}

interface DescribeStacksEntry {
  StackName?: string;
  Tags?: DescribeStacksTag[];
}

interface DescribeStacksResponse {
  Stacks?: DescribeStacksEntry[];
}

function tagsToRecord(tags: DescribeStacksTag[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (!tags) {
    return record;
  }
  for (const tag of tags) {
    if (typeof tag.Key === 'string' && typeof tag.Value === 'string') {
      record[tag.Key] = tag.Value;
    }
  }
  return record;
}

/**
 * Parse the JSON body of `aws cloudformation describe-stacks --output json` into
 * `CandidateStack[]`. Entries without a stack name are skipped; the Tags array is
 * flattened to a `Record`.
 */
export function parseDescribeStacksOutput(json: string): CandidateStack[] {
  let parsed: DescribeStacksResponse;
  try {
    parsed = JSON.parse(json) as DescribeStacksResponse;
  } catch {
    throw new Error('Could not parse aws cloudformation describe-stacks output as JSON.');
  }

  const stacks = parsed.Stacks ?? [];
  const candidates: CandidateStack[] = [];
  for (const entry of stacks) {
    if (typeof entry.StackName !== 'string' || entry.StackName.length === 0) {
      continue;
    }
    candidates.push({
      stackName: entry.StackName,
      tags: tagsToRecord(entry.Tags),
    });
  }
  return candidates;
}

/**
 * Keep only stacks under the broad `AgentraPreview-` namespace, so the rejected
 * list reported by destroy stays focused on near-misses (other preview stages,
 * or preview-named stacks missing required tags) rather than every account stack.
 */
export function filterPreviewCandidates(
  candidates: readonly CandidateStack[],
  prefix: string = PREVIEW_NAMESPACE_PREFIX,
): CandidateStack[] {
  return candidates.filter((candidate) => candidate.stackName.startsWith(prefix));
}

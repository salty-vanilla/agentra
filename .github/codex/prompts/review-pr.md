# Review Pull Request

Use this prompt when Codex is asked to review an Agentra PR.

## Intended Use

Perform a senior engineering review focused on bugs, regressions, security,
package-boundary drift, missing tests, and mismatch with the linked issue.

## Repository Constraints

- Use `AGENTS.md` as the canonical repo guidance.
- Review against Agentra's workspace boundaries, runtime responsibilities, and
  validation expectations.
- Do not approve production deploy automation, auto-merge behavior, secret
  exposure, or unexplained root workspace metadata changes.

## Workflow

1. Gather context.
   - Read PR title, body, linked issues, review comments, changed files, and CI
     status.
   - Read the full changed files or enough surrounding context to understand the
     behavior, not only diff hunks.
   - Identify affected workspaces and runtime boundaries.

2. Verify intent.
   - Compare the diff to the linked issue or stated PR goal.
   - Flag missing acceptance criteria, unrelated scope, or behavior that solves a
     different problem.

3. Review with evidence.
   - Report only findings you can cite precisely.
   - For HIGH or CRITICAL findings, include the exact file/line, concrete failure
     scenario, and why existing guards do not catch it.
   - It is acceptable to return zero findings when the diff is sound.

4. Check Agentra-specific risks.
   - Cross-package relative imports or missing workspace dependencies.
   - `packages/shared` API changes without regeneration or dependent tests.
   - Docker workspace layout regressions.
   - Backend/frontend/runtime responsibility leaks.
   - Secret exposure, unsafe logs, auth gaps, unbounded queries, or SSE/runtime
     error handling regressions.
   - Lockfile, root package, workspace, Biome, or TypeScript config churn used as
     a workaround.

5. Validate.
   - Prefer CI results when available.
   - If running locally, use narrow package commands first and report exactly
     what ran.

## Output Format

Lead with findings, ordered by severity:

```markdown
## Findings

- [P1] Short title
  File: path/to/file.ts:123
  Why this is a real failure:
  Suggested fix:

## Open Questions

## Validation

## Summary
```

If there are no findings, say so clearly and list any residual test or CI gaps.


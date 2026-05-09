---
name: github-pr-review-close
description: Review a GitHub pull request from a PR number, escalate blockers, merge when safe, close linked issues, and update local main. Use when the user gives a PR number and wants an end-to-end review-and-close workflow.
---

# GitHub PR Review Close

Use this skill for PR-number-driven review work that should end in a merge, issue close, and a refreshed local `main`.

## Workflow

1. Inspect the PR.
   - Read the title, body, changed files, labels, review comments, checks, and linked issues.
   - Determine whether the PR is ready to merge and whether it satisfies its linked issue.
   - If the PR number is missing, ask only for that number.

2. Review for blockers.
   - Check correctness, regressions, test coverage, and consistency with repository patterns.
   - Treat failing checks, missing requirements, unclear behavior, or unsafe changes as blockers.
   - If a blocker exists, stop and escalate a concise review summary to the user instead of merging.

3. Merge when safe.
   - Merge only after the review passes and the PR is ready.
   - Use the repository's normal merge method unless the user or repo policy requires a specific one.
   - Prefer `gh` for PR inspection and merge actions.

4. Close linked issues.
   - Close the issue or issues explicitly linked by the PR after the merge succeeds.
   - Confirm the closure reflects the merged change, not just the branch state.

5. Update local `main`.
   - Switch to `main` locally after the merge.
   - Pull the latest `main` so the local branch stays current.
   - Keep the workspace aligned with the merged result.

## Review checklist

- Does the PR match the linked issue?
- Are tests and checks passing?
- Are there behavioral regressions or missing edge cases?
- Is the issue closed after merge?
- Is local `main` updated after the close?


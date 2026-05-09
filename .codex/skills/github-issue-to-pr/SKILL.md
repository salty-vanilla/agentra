---
name: github-issue-to-pr
description: End-to-end GitHub issue workflow for repo-local coding tasks. Use when the user gives a GitHub issue number or asks to take an issue from branch creation through implementation, self-review, escalation of blockers, commit, and PR creation.
---

# GitHub Issue to PR

Use this skill for GitHub issues that should be handled in one pass from planning to pull request.

## Workflow

1. Resolve the issue first.
   - Read the issue title, body, labels, comments, and linked PRs if available.
   - Extract the expected behavior, constraints, and acceptance criteria.
   - If the issue number or scope is missing, ask only for the missing detail.

2. Create a branch from `main`.
   - Fetch or confirm `main` is current before branching.
   - Use a short branch name that includes the issue number.
   - Keep the branch scoped to the issue only.

3. Implement the fix.
   - Make the smallest change that satisfies the issue.
   - Prefer existing patterns in the repository.
   - Add or update tests when behavior changes.

4. Self-review before escalating.
   - Inspect the diff for correctness, regressions, and style consistency.
   - Run the relevant tests or checks.
   - Confirm the change matches the issue and does not introduce unrelated edits.
   - If a problem is found, fix it before moving on.

5. Escalate only when needed.
   - Escalate when the issue depends on missing product decisions, inaccessible systems, or ambiguity that cannot be resolved locally.
   - Escalate with a concise summary of the blocker, what was tried, and the exact decision needed.

6. Commit and open a PR.
   - Write a commit message that references the issue.
   - Open a PR with the issue number, summary of the fix, tests run, and any remaining risks.
   - Link the issue in the PR so GitHub shows the connection explicitly.
   - Create the PR as ready for review, not as a draft.
   - Keep the PR description short but complete.

## Review checklist

- Does the branch start from `main`?
- Does the diff stay within the issue scope?
- Are tests updated or run where relevant?
- Is the final state ready for a reviewer to understand quickly?

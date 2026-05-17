---
name: github-pr-review-close
description: Review a GitHub pull request from a PR number, escalate blockers, merge when safe, close linked issues, and update local main. Use when the user gives a PR number and wants an end-to-end review-and-close workflow.
---

# GitHub PR Review Close

Use this skill for PR-number-driven review work that should end in a merge, issue close, and a refreshed local `main`.

## Agentra sources of truth

- Read `AGENTS.md` before reviewing; it is the canonical repo guidance.
- Use `.github/codex/prompts/review-pr.md` for review discipline and output expectations.
- Use `.github/codex/prompts/review-architecture.md` for runtime responsibility and architecture-fit checks.
- Use `.github/codex/prompts/review-package-boundary.md` when package, Docker, shared contract, or root metadata files changed.

## Scope guards

This skill does not:

- force-merge or bypass failing CI/branch protection;
- merge PRs with unresolved blockers;
- run production deploy commands;
- close issues that are only partially addressed;
- modify code while reviewing unless the user explicitly asks for a follow-up fix.

## Workflow

1. Inspect the PR.
   - Read the title, body, changed files, labels, review comments, checks, and linked issues.
   - Determine whether the PR is ready to merge and whether it satisfies its linked issue.
   - If the PR number is missing, ask only for that number.
   - Check whether the PR says `Closes #N` or `Part of #N`; do not let a phased PR close a tracking issue too early.

2. Review for blockers.
   - Check correctness, regressions, test coverage, and consistency with repository patterns.
   - Treat failing checks, missing requirements, unclear behavior, or unsafe changes as blockers.
   - Treat unexpected root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, workspace package boundary, Codex hook, or deployment behavior changes as blockers unless the issue explicitly requires them.
   - If a blocker exists, stop and escalate a concise review summary to the user instead of merging.

3. Merge when safe.
   - Merge only after the review passes and the PR is ready.
   - Use the repository's normal merge method unless the user or repo policy requires a specific one.
   - Prefer `gh` for PR inspection and merge actions.

4. Close linked issues.
   - Close only the issue or issues fully completed by the PR after the merge succeeds.
   - Leave tracking issues open when the PR body uses `Part of #N` or the issue has later phases remaining.
   - Confirm the closure reflects the merged change, not just the branch state.

5. Update local `main`.
   - Switch to `main` locally after the merge.
   - Pull the latest `main` so the local branch stays current.
   - Keep the workspace aligned with the merged result.

## Review checklist

- Does the PR match the linked issue?
- Are tests and checks passing?
- Are there behavioral regressions or missing edge cases?
- Are Agentra package boundaries, runtime responsibilities, and deployment safety rules preserved?
- Is the issue closed only when the PR fully completes it?
- Is local `main` updated after the close?

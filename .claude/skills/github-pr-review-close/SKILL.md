---
name: github-pr-review-close
description: Review a GitHub pull request, verify the implementation against the linked issue, merge when safe, close linked issues, and update local main. Use when the user gives a PR number and says "review PR #N", "merge PR #N", or "close PR #N".
user-invocable: true
allowed-tools:
  - Bash(gh pr view *)
  - Bash(gh pr merge *)
  - Bash(gh pr checks *)
  - Bash(gh issue view *)
  - Bash(gh issue close *)
  - Bash(git fetch *)
  - Bash(git checkout *)
  - Bash(git pull *)
  - Bash(git log *)
  - Bash(git diff *)
  - Read
---

# /github-pr-review-close — GitHub PR Review, Merge, and Close

Arguments passed: `$ARGUMENTS`

Use this skill to review a pull request end-to-end: inspect the diff, verify against the linked issue, merge when safe, close linked issues, and refresh local `main`.

## Scope guards

This skill does NOT:
- Force-merge (bypass CI or branch protection)
- Close issues that are not linked to the merged PR
- Modify code — review only; if fixes are needed, escalate
- Push directly to `main` or any protected branch

## 1. Parse arguments and load the PR

- Extract the PR number from `$ARGUMENTS`. If missing, ask for it before proceeding.
- Run `gh pr view <N>` to read the title, body, changed files, labels, review comments, checks, and merge state.
- **If the PR is already merged:** report the existing merge state and skip the rest. Do not re-merge.

## 2. Fetch the diff

- Run `git fetch origin` then `gh pr view <N> --json headRefName` to get the branch name.
- Run `git diff origin/main...origin/<head-branch>` to inspect the full diff.

## 3. Verify implementation against the linked issue

- Parse the PR body for linked issue references: `Closes #N`, `Fixes #N`, `Resolves #N`.
- For each linked issue, run `gh issue view <N>` to read the original requirements and acceptance criteria.
- **Explicitly verify:**
  - Does the diff address the stated problem?
  - Are all acceptance criteria met?
  - Are there behaviors described in the issue that are NOT covered by the diff?
- If the implementation diverges from the issue intent, treat it as a blocker and escalate.

## 4. Review for blockers

Treat any of the following as a blocker — stop and escalate rather than merging:

- Failing or pending required CI checks (`gh pr checks <N>`)
- Branch protection requires approvals and none exist yet
- Diff introduces regressions, unsafe changes, or missing edge cases
- Implementation does not satisfy the linked issue's acceptance criteria
- Scope of changes is unclear or unexpectedly large

When escalating, provide: what was reviewed, what the blocker is, and the exact decision or fix needed.

## 5. Merge when safe

- Confirm all checks pass and no blockers exist before merging.
- **Merge method selection:**
  - **Squash** (preferred for feature/fix branches): `gh pr merge <N> --squash` — keeps `main` history clean
  - **Merge commit**: use if repo settings explicitly require it: `gh pr merge <N> --merge`
  - **Rebase**: use only if required by repo policy: `gh pr merge <N> --rebase`
- Default to squash unless the repository or user specifies otherwise.

## 6. Close linked issues (auto-close detection)

- After merge, run `gh issue view <N>` for each linked issue to check its state.
- GitHub auto-closes issues when `Closes #N` is in the PR body merged into the default branch.
- **Only run `gh issue close <N>` if the issue is still open** — avoid double-closing.

## 7. Update local `main`

- Run `git checkout main && git pull origin main` to refresh the local branch.
- Confirm the local `main` SHA matches the merge commit.

## 8. End-of-run report

After completion, output:
- PR URL and title
- Merge commit SHA
- Issues closed (and whether auto-closed by GitHub or manually closed by this skill)
- Local `main` SHA after pull
- Any risks or follow-up items noted during review

## Review checklist

- [ ] PR number resolved from `$ARGUMENTS`
- [ ] PR is not already merged (idempotency check)
- [ ] Diff fetched and inspected
- [ ] Linked issues identified and implementation verified against them
- [ ] All CI checks pass; no branch-protection blockers
- [ ] Merged using the correct merge method (squash by default)
- [ ] Auto-close detection ran before any manual `gh issue close`
- [ ] Local `main` updated after merge

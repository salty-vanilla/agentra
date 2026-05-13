---
name: github-pr-review-close
description: Review a GitHub pull request, verify against the linked issue, merge when safe, clean up the worktree, and update local main. Use when the user says "review PR #N", "merge PR #N", or "close PR #N".
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
  - Bash(git worktree *)
  - Bash(git branch *)
  - Read
---

# /github-pr-review-close — PR Review, Merge, Worktree Cleanup

Arguments passed: `$ARGUMENTS`

Review a pull request end-to-end: inspect the diff, verify against the linked issue,
merge when safe, clean up the associated worktree, close linked issues, and refresh local `main`.

## Scope guards

This skill does NOT:
- Force-merge (bypass CI or branch protection)
- Close issues not linked to the merged PR
- Modify code — review only; if fixes are needed, escalate
- Push directly to `main`

---

## 1. Parse arguments and load the PR

- Extract the PR number from `$ARGUMENTS`. If missing, ask.
- Run `gh pr view <N> --json title,body,headRefName,state,mergeable,reviewDecision` to read PR state.
- **If already merged:** report the existing state and skip to step 7 (worktree cleanup). Do not re-merge.

## 2. Fetch the diff

```bash
git fetch origin
HEAD_BRANCH=$(gh pr view <N> --json headRefName --jq '.headRefName')
git diff origin/main...origin/$HEAD_BRANCH
```

## 3. Verify implementation against the linked issue

- Parse the PR body for `Closes #N`, `Fixes #N`, `Resolves #N`.
- For each linked issue: `gh issue view <N>` to read requirements and acceptance criteria.
- **Explicitly verify:**
  - Does the diff address the stated problem?
  - Are all acceptance criteria met?
  - Are there behaviors described in the issue that the diff does NOT cover?
- Divergence from the issue intent is a blocker — escalate rather than merging.

## 4. Review for blockers

Treat any of the following as a blocker:

| Blocker | Check |
|---------|-------|
| Failing CI | `gh pr checks <N>` |
| Missing required approval | `gh pr view <N> --json reviewDecision` |
| Regressions or unsafe changes | Manual diff review |
| Acceptance criteria not met | Step 3 verification |
| Unexpectedly large scope | Diff size vs. issue scope |

When escalating, provide: what was reviewed, what the blocker is, and what needs to change.

## 5. Merge when safe

```bash
gh pr merge <N> --squash --delete-branch
```

**Merge method:**
- **Squash** (default) — keeps `main` history clean, one commit per issue
- Override only if repository policy requires merge commit or rebase

`--delete-branch` removes the remote branch on merge.

## 6. Clean up the local worktree

After merge, find and remove the associated worktree:

```bash
# Find worktree matching the issue number
git worktree list

# The worktree path follows .worktrees/<N>-<slug>
# Remove it (use --force only if there are no uncommitted changes worth keeping)
git worktree remove .worktrees/<N>-<slug>
git branch -d "fix/#<N>-<slug>" 2>/dev/null || true
```

If no worktree exists (e.g., PR was created from another machine), skip silently.

## 7. Close linked issues (auto-close detection)

GitHub auto-closes issues when `Closes #N` is in the squash-merged PR body.
After merge:

```bash
# Check if the issue was auto-closed
gh issue view <N> --json state --jq '.state'
```

Only run `gh issue close <N>` if the issue is still open after merge. Do not double-close.

## 8. Update local `main`

```bash
git checkout main && git pull origin main
```

Confirm local `main` SHA matches the merge commit.

## 9. End-of-run report

Output:
- PR URL and title
- Merge commit SHA
- Issues closed (auto or manual)
- Worktree cleaned up (path, or "none found")
- Local `main` SHA after pull
- Any risks or follow-up items noted

## Review checklist

- [ ] PR not already merged (idempotency check)
- [ ] Full diff fetched and inspected
- [ ] Linked issues identified; acceptance criteria verified
- [ ] All CI checks pass; no branch-protection blockers
- [ ] Merged with `--squash --delete-branch`
- [ ] Worktree `.worktrees/<N>-<slug>` removed (or confirmed absent)
- [ ] Local branch `fix/#<N>-<slug>` deleted
- [ ] Auto-close check ran before any manual `gh issue close`
- [ ] Local `main` updated after merge

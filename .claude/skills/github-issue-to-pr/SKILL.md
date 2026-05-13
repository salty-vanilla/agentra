---
name: github-issue-to-pr
description: End-to-end GitHub issue workflow with git worktree isolation. Use when given a GitHub issue number to take from worktree creation through implementation, self-review, commit, and PR creation. Triggered by phrases like "fix issue #N", "take issue #N", "implement #N", or "/github-issue-to-pr <N>".
user-invocable: true
allowed-tools:
  - Bash(gh issue view *)
  - Bash(gh issue list *)
  - Bash(gh pr create *)
  - Bash(gh pr list *)
  - Bash(git fetch *)
  - Bash(git worktree *)
  - Bash(git checkout *)
  - Bash(git branch *)
  - Bash(git push *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git status *)
  - Bash(pnpm *)
  - Read
  - Edit
  - Write
---

# /github-issue-to-pr — GitHub Issue to Pull Request (Worktree-isolated)

Arguments passed: `$ARGUMENTS`

Use this skill to take a GitHub issue all the way to a ready-for-review PR in one pass,
working in an isolated git worktree so parallel sessions never interfere.

## Scope guards

This skill does NOT:
- Push directly to `main` or any protected branch
- Force-push (`--force`)
- Close or delete issues
- Modify files outside the issue scope
- Make changes in the main checkout (always works in `.worktrees/`)

---

## 1. Parse arguments and resolve the issue

- Extract the issue number from `$ARGUMENTS`. If missing, ask for it.
- Run `gh issue view <N>` to read title, body, labels, and comments.
- Extract: expected behavior, constraints, acceptance criteria.
- If scope is unclear and cannot be resolved from the issue thread, escalate before branching.

## 2. Create an isolated worktree

```bash
# Fetch latest main
git fetch origin main

# Determine branch name
BRANCH="fix/#<N>-<short-slug>"   # e.g. fix/#42-add-retry-logic
WORKTREE=".worktrees/<N>-<short-slug>"   # e.g. .worktrees/42-add-retry-logic

# Create worktree + branch in one step
git worktree add "$WORKTREE" -b "$BRANCH" origin/main
```

**Naming rules:**
- Branch: `fix/#<N>-<short-slug>` (3–5 words, lowercase, hyphen-separated)
- Worktree dir: `.worktrees/<N>-<short-slug>` (no `#` in path)
- Always quote paths in shell commands

**If the worktree/branch already exists:** reuse it (`git worktree add` will fail; just `cd` into the existing path).

**All subsequent file operations happen inside `$WORKTREE`, not the main checkout.**

## 3. Install dependencies (if needed)

If `package.json` changed or `node_modules` is absent in the worktree:

```bash
cd "$WORKTREE" && pnpm install
```

## 4. Implement the fix

- Make the smallest change that satisfies the acceptance criteria.
- Follow existing patterns and conventions in the repository.
- Add or update tests when behavior changes.
- Do not make unrelated edits. If you notice a separate issue, flag it but do not fix it here.

**Workspace awareness:**
- If touching `packages/shared`: run `pnpm build:shared` inside the worktree before testing dependents.
- If touching API types: run `pnpm generate:api` then `pnpm build:shared`.

## 5. Build and verify

Run these from inside `$WORKTREE`:

```bash
# Always required
pnpm build:shared

# Type check all workspaces
pnpm typecheck

# Run tests for affected workspace(s)
pnpm --filter @agentra/backend test   # if backend changed
pnpm --filter @agentra/frontend test  # if frontend changed

# Lint
pnpm lint
```

Identify which workspace(s) were actually touched and run only the relevant tests.
If `shared` was changed, test both `backend` and `frontend`.

## 6. Self-review

- Inspect the diff: `git diff origin/main..HEAD` from inside the worktree.
- Confirm the change matches the issue and does not introduce regressions.
- If a problem is found, fix it before moving on.

## 7. Escalate only when needed

Escalate when:
- The issue depends on a product decision that cannot be resolved from code or issue thread.
- Required systems or credentials are inaccessible.
- Ambiguity remains after reading all issue comments and linked PRs.

When escalating, provide: what was tried, what information is missing, and the exact decision needed.

## 8. Commit and open a PR

From inside `$WORKTREE`:

```bash
git add -p   # stage only relevant changes
git commit -m "fix: <description> (#<N>)"
git push -u origin "$BRANCH"
```

Create the PR:
```bash
gh pr create \
  --title "<concise title matching the issue>" \
  --body "$(cat <<'EOF'
## Summary
<what was changed and why>

## Test plan
- [ ] pnpm typecheck passed
- [ ] pnpm test passed for affected workspace(s)
- [ ] pnpm lint passed

Closes #<N>
EOF
)"
```

## 9. Final report

Output:
- PR URL
- Branch name
- Worktree path (so it can be cleaned up after merge)
- Files changed (count and names)
- Tests run and their result
- Any escalations or risks noted

## Review checklist

- [ ] Worktree created at `.worktrees/<N>-<slug>`
- [ ] Branch starts from `origin/main` (not a stale local copy)
- [ ] Branch name follows `fix/#<N>-<short-slug>` convention
- [ ] `pnpm build:shared` ran if `packages/shared` was touched
- [ ] `pnpm typecheck` passed
- [ ] Relevant workspace tests passed
- [ ] `pnpm lint` passed
- [ ] Diff stays within issue scope
- [ ] PR body contains `Closes #<N>`
- [ ] PR is ready for review, not draft
- [ ] Worktree path reported for post-merge cleanup

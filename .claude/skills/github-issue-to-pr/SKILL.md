---
name: github-issue-to-pr
description: End-to-end GitHub issue workflow. Use when given a GitHub issue number to take from branch creation through implementation, self-review, commit, and PR creation. Triggered by phrases like "fix issue #N", "take issue #N", "implement #N", or "/github-issue-to-pr <N>".
user-invocable: true
allowed-tools:
  - Bash(gh issue view *)
  - Bash(gh issue list *)
  - Bash(gh pr create *)
  - Bash(gh pr list *)
  - Bash(git fetch *)
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

# /github-issue-to-pr — GitHub Issue to Pull Request

Arguments passed: `$ARGUMENTS`

Use this skill to take a GitHub issue all the way to a ready-for-review PR in one pass.

## Scope guards

This skill does NOT:
- Push directly to `main` or any protected branch
- Force-push (`--force`)
- Close or delete issues
- Modify files outside the issue scope

## 1. Parse arguments and resolve the issue

- Extract the issue number from `$ARGUMENTS`. If missing, ask for it before proceeding.
- Run `gh issue view <N>` to read the title, body, labels, and comments.
- Extract: expected behavior, constraints, acceptance criteria.
- If scope is unclear and cannot be resolved locally, escalate before branching.

## 2. Create a branch from `main`

- Fetch the latest `main`: `git fetch origin main`.
- Check out a new branch from `origin/main`.
- **Branch naming:** `fix/#<ISSUE_ID>-<short-slug>` (e.g., `fix/#111-add-retry-logic`)
  - Always quote the branch name in shell: `git checkout -b 'fix/#111-add-retry-logic'`
  - Keep `<short-slug>` to 3–5 words, lowercase, hyphen-separated.
- **If the branch already exists:** check it out, verify it originated from `main`, and continue from the current state rather than failing or overwriting.

## 3. Implement the fix

- Make the smallest change that satisfies the issue acceptance criteria.
- Prefer existing patterns and conventions in the repository.
- Add or update tests when behavior changes.
- Do not make unrelated edits; if you notice a separate issue, flag it but do not fix it here.

## 4. Self-review

- Inspect the diff: `git diff`.
- Run the relevant tests or quality checks (e.g., `pnpm typecheck`, `pnpm test`).
- Confirm the change matches the issue and does not introduce regressions.
- If a problem is found, fix it before moving on.

## 5. Escalate only when needed

Escalate when:
- The issue depends on a product decision that cannot be resolved from the code or issue thread.
- Required systems or credentials are inaccessible.
- Ambiguity remains after reading all issue comments and linked PRs.

When escalating, provide: what was tried, what information is missing, and the exact decision needed.

## 6. Commit and open a PR

- Stage and commit with a message referencing the issue: `fix: <description> (#<ISSUE_ID>)`.
- Push the branch: `git push -u origin 'fix/#<ISSUE_ID>-<short-slug>'`
- Create the PR with `gh pr create`:
  - Title: concise, matches the issue title
  - Body: issue number, summary of the fix, tests run, any remaining risks
  - Include `Closes #<ISSUE_ID>` in the PR body to link the issue
  - Status: ready for review (not draft)

## 7. Final report

After the PR is created, output:
- PR URL
- Branch name
- Files changed (count and names)
- Tests run and their result
- Any escalations or risks noted

## Review checklist

- [ ] Branch starts from `main` (not a stale local copy)
- [ ] Branch name follows `fix/#<ISSUE_ID>-<short-slug>` convention
- [ ] Diff stays within issue scope
- [ ] Tests updated or run where relevant
- [ ] PR body contains `Closes #<ISSUE_ID>`
- [ ] PR is ready for review, not draft

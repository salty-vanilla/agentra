---
name: github-address-comments
description: Address actionable GitHub pull request review comments for Agentra. Use when the user asks to handle PR comments, review feedback, requested changes, or unresolved threads.
---

# GitHub Address Comments

Use this skill when a PR already exists and the next task is to handle review
feedback.

## Agentra sources of truth

- Read `AGENTS.md`.
- Use `.github/codex/prompts/review-pr.md` to understand review expectations.
- Use `.github/codex/prompts/review-package-boundary.md` for package, Docker,
  root metadata, or generated-file comments.

## Workflow

1. Inspect comments before editing.
   - Read unresolved review threads, inline comments, and conversation comments.
   - Distinguish blockers from suggestions.
   - Do not resolve or reply to GitHub threads unless the user asks.

2. Plan the response.
   - Group related comments.
   - Identify which comments require code/doc changes and which need
     explanation only.
   - Preserve the PR's existing scope.

3. Implement targeted changes.
   - Change only files needed for the selected comments.
   - Do not introduce dependencies, deployment automation, or metadata churn to
     satisfy comments unless explicitly required.

4. Validate and push.
   - Run narrow checks for the changed area.
   - Report what was addressed and what remains unresolved.

## Output

Summarize addressed comments, changed files, validation, and any comments left
for human decision.

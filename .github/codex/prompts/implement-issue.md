# Implement Issue

Use this prompt when Codex is asked to implement a GitHub issue in Agentra.

## Intended Use

Turn one issue into a small, reviewable branch and PR-ready diff. Codex should be
the primary implementation agent, while Claude Code can remain a helper for
local reproduction, CLI-heavy debugging, and secondary review.

## Repository Constraints

- Read `AGENTS.md` first and follow it as the canonical repo guidance.
- Agentra is a pnpm workspace monorepo. Do not casually change root
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, workspace package
  boundaries, or deployment behavior.
- `packages/shared` is the API/OpenAPI source of truth. API shape changes must
  update shared schema/types and regenerate dependent clients.
- Use workspace imports such as `@agentra/shared`; do not add cross-package
  relative imports.
- Avoid new dependencies unless the issue clearly requires one and the PR
  explains why.
- Do not commit secrets, run production deploys, add auto-merge behavior, or
  bypass quality gates.

## Workflow

1. Resolve the issue.
   - Read the title, body, comments, labels, linked PRs, and acceptance criteria.
   - Restate the target behavior and constraints.
   - Ask only for missing product decisions that cannot be discovered locally.

2. Ground in the repo.
   - Inspect current files, package scripts, tests, and nearby implementations.
   - Identify the owning workspace and boundaries before editing.
   - Prefer existing patterns over new abstractions.

3. Prepare scoped work.
   - Branch from current `main` or the user's requested base.
   - If parallel issue work is expected, prefer an isolated worktree named
     `.worktrees/<issue-number>-<short-slug>` and branch
     `fix/#<issue-number>-<short-slug>`.
   - Keep all changes inside the issue scope.

4. Implement.
   - Make the smallest change that satisfies the issue.
   - Add or update tests when behavior changes.
   - If touching `packages/shared`, run generation/build steps before testing
     dependents.
   - Do not paper over errors by weakening config or rewriting workspace
     metadata.

5. Self-review.
   - Inspect `git diff` against the base branch.
   - Check correctness, package boundaries, security, and tests.
   - Confirm the implementation matches the issue and no unrelated edits leaked
     in.

6. Validate.
   - Run narrow commands for affected workspaces first.
   - Broaden to `pnpm lint`, `pnpm typecheck`, and relevant tests before PR
     handoff when code changed.
   - Record commands and results exactly.

## Output Format

End with:

- Summary of what changed.
- Files or workspaces touched.
- Validation commands run and results.
- Risks, follow-ups, or blockers.
- PR body draft when asked to open a PR:
  - Summary
  - Test plan
  - `Closes #<issue-number>` when appropriate


---
name: github-issue-to-pr
description: End-to-end GitHub issue workflow for repo-local coding tasks. Use when the user gives a GitHub issue number or asks to take an issue from branch creation through implementation, self-review, escalation of blockers, commit, and PR creation.
---

# GitHub Issue to PR

Use this skill for GitHub issues that should be handled in one pass from planning to pull request.

## Agentra sources of truth

- Read `AGENTS.md` before editing; it is the canonical repo guidance.
- Use `.github/codex/prompts/implement-issue.md` for issue workflow details.
- Use `.github/codex/prompts/review-package-boundary.md` when the change touches workspace packages, shared contracts, Dockerfiles, or root metadata.
- Keep `docs/development/codex-migration.md` and `docs/development/codex-config.md` in mind for Codex workflow and MCP/config work.
- Phase 4 guardrails live in `.codex/hooks.json` and `scripts/agent/codex_guardrails.py`; treat a guardrail block as a signal to narrow the change or ask for explicit confirmation.

## Scope guards

This skill does not:

- push directly to `main` or another protected branch;
- force-push;
- run production deploy commands;
- add auto-merge behavior;
- casually change root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, workspace package boundaries, or deployment/runtime behavior.

## Workflow

1. Resolve the issue first.
   - Read the issue title, body, labels, comments, and linked PRs if available.
   - Extract the expected behavior, constraints, and acceptance criteria.
   - If the issue number or scope is missing, ask only for the missing detail.

2. Create a branch from `main`.
   - Fetch or confirm `main` is current before branching.
   - Use a short branch name that includes the issue number, preferably `codex/<issue-number>-<short-slug>`.
   - Keep the branch scoped to the issue only.

3. Implement the fix.
   - Make the smallest change that satisfies the issue.
   - Prefer existing patterns in the repository.
   - Add or update tests when behavior changes.
   - If API shapes change, update `packages/shared`, run `pnpm generate:api`, and build shared.
   - If touching workspace/package boundaries, verify dependencies are declared through package names rather than cross-package relative imports.

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
   - Use `Closes #N` only when the PR fully completes the issue. Use `Part of #N` for phased work.
   - Default to a draft PR unless the user asks for ready-for-review or the workflow requires a ready PR.
   - Keep the PR description short but complete.

## Validation

- Docs or prompt-only changes: `pnpm biome check --no-errors-on-unmatched <changed paths>`, plus `git diff --check`.
- Code changes: run the affected workspace tests, then broaden to `pnpm biome check .` and `pnpm typecheck` before handoff.
- Shared contract changes: run `pnpm generate:api`, `pnpm build:shared`, and dependent workspace tests.
- Live AgentCore smoke tests are manual and require explicit user request plus local AWS environment.
- If hook guardrails warn about root metadata, Docker, workflow, CDK, runtime, or console logging changes, inspect the warning before pushing and mention the intentional reason in the PR when relevant.

## Review checklist

- Does the branch start from `main`?
- Does the diff stay within the issue scope?
- Are tests updated or run where relevant?
- Are package boundaries and runtime responsibilities preserved?
- Does the PR link the issue accurately without closing a phased issue too early?
- Is the final state ready for a reviewer to understand quickly?

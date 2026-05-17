---
name: github-fix-ci
description: Diagnose and fix failing GitHub Actions checks for Agentra PRs. Use when the user asks to fix CI, debug a failing check, or repair a PR after Actions failures.
---

# GitHub Fix CI

Use this skill for PR or branch work where GitHub Actions or local quality gates
are failing.

## Agentra sources of truth

- Read `AGENTS.md`.
- Use `.github/codex/prompts/fix-ci.md` for the detailed workflow.
- Use `.github/codex/prompts/review-package-boundary.md` if the failure touches
  package metadata, Dockerfiles, generated outputs, or workspace boundaries.

## Scope guards

This skill does not:

- weaken Biome, TypeScript, Lefthook, package scripts, or CI workflows to hide a
  failure;
- change root `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml` unless
  the failing intended change genuinely requires it;
- install dependencies or regenerate lockfiles casually;
- run production deployment commands.

## Workflow

1. Inspect the failing checks first.
   - Read PR status, failing job names, steps, and first meaningful log lines.
   - Prefer GitHub Actions logs for CI failures and local command output for
     local failures.

2. Reproduce narrowly.
   - Use the package filter or root command that maps to the failing job.
   - Fix upstream failures before downstream cascades.

3. Fix minimally.
   - Read the failing source and nearby tests.
   - Preserve package boundaries and runtime responsibilities.
   - If the same failure persists after multiple attempts, stop and summarize the
     blocker rather than guessing.

4. Verify.
   - Re-run the failing command.
   - Broaden to `pnpm biome check .`, `pnpm typecheck`, or `pnpm test` only when
     scope warrants it.

## Output

End with the failing check, root cause, fix summary, validation commands, and any
remaining CI risk.

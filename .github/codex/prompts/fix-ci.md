# Fix CI

Use this prompt when Codex is asked to diagnose and fix failing Agentra checks.

## Intended Use

Find the root cause of failing CI, reproduce narrowly when possible, and make the
smallest safe fix without bypassing repository quality gates.

## Repository Constraints

- Follow `AGENTS.md`.
- Do not weaken Biome, TypeScript, Lefthook, package scripts, CI workflows, or
  workspace metadata just to make a failure disappear.
- Do not change root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or
  package boundaries unless the CI failure is directly caused by a legitimate
  intended change in those files.
- Do not install dependencies or regenerate lockfiles unless the issue/PR
  intentionally changes dependencies.

## Workflow

1. Inspect failing checks.
   - Identify the exact job, step, command, workspace, and first meaningful
     failure.
   - Prefer GitHub Actions logs for CI failures and local command output for
     local failures.

2. Group failures.
   - Separate lint, typecheck, test, build, Docker smoke, and live-runtime
     problems.
   - Fix upstream failures first, especially shared package build or generated
     type failures that cascade into other workspaces.

3. Reproduce narrowly.
   - Use package filters when possible:
     - `pnpm --filter @agentra/backend test`
     - `pnpm --filter @agentra/frontend test`
     - `pnpm --filter @agentra/agentcore-runtime-ts test`
     - `pnpm --filter @agentra/presentation-author-runtime test`
     - `pnpm --filter @agentra/infra-cdk typecheck`
   - For shared API/type issues, run `pnpm generate:api` and
     `pnpm build:shared` only when shared inputs changed.

4. Fix minimally.
   - Read the failing source and relevant callers.
   - Preserve local patterns.
   - Avoid broad refactors while fixing CI.
   - If the same failure persists after multiple attempts, stop and summarize the
     blocker instead of guessing.

5. Verify.
   - Re-run the failing command.
   - Broaden only as needed to prove the fix.
   - Report commands and results.

## Output Format

End with:

- Failing check and root cause.
- Fix summary.
- Validation commands and results.
- Remaining CI risk or skipped checks.


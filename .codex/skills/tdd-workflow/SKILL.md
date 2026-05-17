---
name: tdd-workflow
description: Use when adding features, fixing bugs, or refactoring Agentra code where tests should drive or lock down behavior. Prefer risk-scaled tests and existing pnpm workspace commands over generic coverage mandates.
---

# TDD Workflow

Use this skill to keep Agentra code changes test-led without importing
Claude-specific checkpoint flows or generic app assumptions.

## Agentra Posture

- Start with the smallest test or reproduction that exercises the intended
  behavior.
- Prefer targeted workspace commands before broad root commands.
- Add coverage proportional to risk: unit tests for pure logic, integration
  tests for package boundaries and APIs, E2E tests for critical browser flows.
- Do not create checkpoint commits as part of the TDD cycle. Commit once the
  task is coherent and validated.
- Do not chase arbitrary 80% coverage for docs, prompts, or low-risk config
  changes.

## Sources Of Truth

- `AGENTS.md`
- `.github/codex/prompts/implement-issue.md`
- `.github/codex/prompts/fix-ci.md`
- `.github/codex/prompts/review-package-boundary.md`

## Workflow

1. Identify the owning workspace and behavioral contract.
2. Add or update the narrowest meaningful test first.
3. Run the focused test target and confirm it fails for the intended reason.
4. Implement the smallest source change that makes the test pass.
5. Rerun the focused target, then broaden validation when the blast radius
   warrants it.
6. Keep generated OpenAPI/shared artifacts aligned when API contracts change.

## Command Selection

Use commands that match the changed package:

- Shared contracts: `pnpm --filter @agentra/shared test`
- Backend: `pnpm --filter @agentra/backend test`
- Frontend: `pnpm --filter @agentra/frontend test`
- AgentCore runtime: `pnpm --filter @agentra/agentcore-runtime-ts test`
- Presentation package/runtime:
  `pnpm --filter @agentra/presentation-author test`
- Infra/CDK: `pnpm --filter @agentra/infra-cdk test`

Then run broader gates when scope warrants:

```bash
pnpm biome check .
pnpm typecheck
pnpm test
```

## Review Checklist

- The test exercises behavior, not incidental implementation details.
- The failing state was caused by the intended gap, not broken setup.
- The fix stays inside the owning workspace boundary.
- Shared API changes start from `packages/shared`, not hand-edited generated
  clients.
- No test, lint, typecheck, or workspace config was weakened to make the change
  pass.

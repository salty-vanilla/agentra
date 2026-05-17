---
name: agentra-cdk-verify
description: Worktree-safe CDK + AgentCore verification for Agentra. Use whenever a task touches infra/cdk/, apps/agentcore-runtime-ts/, runtime smoke scripts, or any change that needs a CloudFormation deploy. Forces per-worktree ephemeral stages, named stack groups, and gated destructive commands so parallel agents do not collide on the shared dev environment.
---

# Agentra CDK Verify

Use this skill for any deploy/diff/smoke task in Agentra that changes
infrastructure or AgentCore runtime behavior. It assumes a worktree under
`.worktrees/<N>-<slug>/` and an ephemeral stage like `dev-issue-<N>`.

## Sources of truth

- `AGENTS.md` — repository-wide rules.
- `docs/development/cdk-verify.md` — full reference for stage names, stack
  groups, environment, hotswap, cleanup, and the PR summary template.
- `justfile` — `cdk-*` and `verify-*` recipes implementing this workflow.
- `scripts/agent/cdk-stage.sh` — shared helpers (`validate_stage`,
  `assert_ephemeral_stage`, `resolve_stack_group`, `require_confirm_stage`,
  `build_cdk_flags`).
- `infra/cdk/bin/agentra-cdk.ts` — authoritative stack list and stage contract.
- `apps/agentcore-runtime-ts/scripts/` — smoke scripts and the
  `agentcore-logs.ts` CLI used by the recipes.

## Safety

- Never deploy from a worktree to `dev`, `prod`, `production`, `main`, `master`,
  `staging`, or `release` without explicit user direction.
- `cdk-deploy-dev` (hotswap) and all destroy commands enforce ephemeral stages.
- `cdk-destroy` and `cdk-cleanup-ephemeral` require `CONFIRM_STAGE=<stage>` in
  the environment.
- Never print secrets or real `.env.local` values.
- Hotswap deploys may introduce CloudFormation drift; always run
  `cdk-reconcile` before opening a PR.
- Retained resources (S3, log groups, OpenSearch collections, etc.) are listed
  in `docs/development/cdk-verify.md#retained-resources`. The helpers do not
  auto-delete them.

## Workflow

```text
1. Pick an ephemeral stage:        dev-issue-<N>  or  dev-<agent>-<topic>
2. Preflight:                      just cdk-stage-info <group> <stage> <profile>
3. Diff:                           just cdk-diff <group> <stage> <profile>
4. Deploy with outputs:            just cdk-deploy-with-outputs <group> <stage> <profile>
5. Smoke:                          just smoke-agentcore <stage> <profile>
                                   just smoke-slide <stage> <profile>
6. Scan recent errors:             just agentcore-errors <stage> 15m <profile>

   Or run steps 2–6 in one command:
                                   just verify-cdk <group> <stage> <profile>
```

Fast iteration after the first full deploy:

```text
just cdk-deploy-dev runtime <stage> <profile>     # hotswap-fallback
just smoke-agentcore <stage> <profile>
# Before the PR:
just cdk-reconcile <group> <stage> <profile>      # reverts any drift
```

Cleanup (explicit, gated):

```text
CONFIRM_STAGE=<stage> just cdk-cleanup-ephemeral <stage> <profile>
```

## Stack groups

`agentcore` (default), `runtime`, `kb`, `slide`, `data`, `gateway`, `api`,
`web`, `all`. Expansions are documented in `docs/development/cdk-verify.md` and
implemented in `scripts/agent/cdk-stage.sh::resolve_stack_group`.

## Output

Add the PR summary block from `docs/development/cdk-verify.md#pr-summary-template`
to the pull request body. Include: stage, group, profile, commands run, outputs
file path, observed errors, and cleanup status.

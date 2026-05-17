---
description: Worktree-safe CDK + AgentCore verification — diff, deploy, smoke, log scan against an ephemeral stage
argument-hint: [group] [stage] [profile]
---

# CDK Verify

**Input**: `$ARGUMENTS` — `<group> <stage> <profile>`, e.g. `agentcore dev-issue-224 quick-admin`.
Defaults: `group=agentcore`, `stage=dev`, `profile=quick-admin`.

Full reference: `docs/development/cdk-verify.md`. Codex skill:
`.codex/skills/agentra-cdk-verify/SKILL.md` (same workflow, treat that file as
the source of truth for any edge case).

---

## Rules

1. Never deploy from a worktree to `dev`, `prod`, `production`, `main`, `master`,
   `staging`, or `release` without explicit user direction.
2. Use an ephemeral stage derived from the issue / topic
   (`dev-issue-<N>` or `dev-<agent>-<topic>`).
3. Run `just cdk-stage-info` first so the human in the loop sees AWS identity
   and the resolved stack list.
4. Hotswap (`cdk-deploy-dev`) is for ephemeral stages only. Follow it with
   `cdk-reconcile` before opening a PR.
5. Cleanup requires `CONFIRM_STAGE=<stage>` in the environment.

## Stack groups

`agentcore` (default), `runtime`, `kb`, `slide`, `data`, `gateway`, `api`,
`web`, `all`. Definitions in `scripts/agent/cdk-stage.sh::resolve_stack_group`.

## Canonical sequence

```bash
# Preflight (no AWS changes)
just cdk-stage-info <group> <stage> <profile>

# Diff
just cdk-diff <group> <stage> <profile>

# Deploy and capture outputs to .agentra/outputs/<stage>.json
just cdk-deploy-with-outputs <group> <stage> <profile>

# Smoke
just smoke-agentcore <stage> <profile>
just smoke-slide <stage> <profile>

# Scan recent error logs
just agentcore-errors <stage> 15m <profile>
```

Or run all six in one go:

```bash
just verify-cdk <group> <stage> <profile>
```

## Hotswap iteration

```bash
just cdk-deploy-dev runtime <stage> <profile>     # ~30s redeploy for Lambda
just smoke-agentcore <stage> <profile>
# Before PR:
just cdk-reconcile <group> <stage> <profile>      # revert any drift
```

## Cleanup

```bash
CONFIRM_STAGE=<stage> just cdk-cleanup-ephemeral <stage> <profile>
```

Inspect retained resources (S3 buckets, log groups, OpenSearch collections) per
`docs/development/cdk-verify.md#retained-resources` and remove manually if you
need a fully clean slate.

## PR summary

Copy the block from `docs/development/cdk-verify.md#pr-summary-template` into
the PR body. It includes: stage, group, profile, commands run, outputs file
path, errors observed, cleanup status.

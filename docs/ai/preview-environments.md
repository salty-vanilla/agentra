# AI Agent Operating Guide: Preview Environments

This guide defines how AI agents (Claude Code, Codex) and humans operate Agentra's
**safe, ephemeral AWS preview environments**. It exists so AI-assisted development can
validate real AWS behavior without granting agents the ability to run arbitrary
destructive AWS or CDK commands.

It is part of **Epic [#313](https://github.com/salty-vanilla/agentra/issues/313):
Safe ephemeral preview environments for AI-assisted development**, and is written to be
referenced from future implementation prompts and PR review instructions.

## Related issues

| Issue | Scope | Status |
|-------|-------|--------|
| [#313](https://github.com/salty-vanilla/agentra/issues/313) | Epic: safe ephemeral preview environments | Umbrella |
| [#314](https://github.com/salty-vanilla/agentra/issues/314) | Preview stage naming + guardrail library (`scripts/preview/`) | Implemented |
| [#315](https://github.com/salty-vanilla/agentra/issues/315) | Preview CDK context and stack isolation | Planned |
| [#316](https://github.com/salty-vanilla/agentra/issues/316) | Local preview plan/deploy/outputs commands | Planned |
| [#317](https://github.com/salty-vanilla/agentra/issues/317) | Local preview destroy command with safety checks | Implemented |
| [#318](https://github.com/salty-vanilla/agentra/issues/318) | Preview smoke tests for ephemeral environments | Planned |
| [#319](https://github.com/salty-vanilla/agentra/issues/319) | GitHub Actions manual preview deploy/destroy workflow | Planned |
| [#320](https://github.com/salty-vanilla/agentra/issues/320) | Preview cleanup and stale environment detection | Planned |
| [#321](https://github.com/salty-vanilla/agentra/issues/321) | AI agent operating guide | This document |

> Status reflects intent at authoring time. Treat the linked issues as the live source
> of truth for what is implemented.

## Core rule

> **AI agents may validate AWS behavior only through preview commands.**
> **AI agents must not run arbitrary CDK or AWS mutation commands.**

## Command availability (read this first)

The `preview:*` commands below are the **intended, sanctioned command contract** for
preview work under Epic #313. They are being implemented across sibling issues: #315 for
CDK isolation, #316 for plan/deploy/outputs, #317 for destroy, #318 for smoke, #319 for
GitHub Actions, and #320 for cleanup. **Not all of them exist yet**.

- If a `preview:*` command is **not yet implemented**, do **not** approximate it with raw
  `cdk deploy` / `cdk destroy` or direct `aws` commands. Wait for the command to land, or
  stop and report that the command is missing.
- This preview control plane is **separate** from the existing CDK verification flow
  (`dev-issue-<N>` / `dev-<agent>-<topic>` ephemeral stages, the `just cdk-*` /
  `just verify-cdk` recipes in [`docs/development/cdk-verify.md`](../development/cdk-verify.md)).
  Those `dev-*` stages are the legacy worktree CDK-verify path and are **not** valid #313
  preview stages. Preview stages are `pr-*`, `sandbox-*`, or `local-*` only (see below).

## Allowed commands

These are the only sanctioned commands for AI-assisted preview work:

```bash
pnpm preview:plan --stage <preview-stage> --profile minimal-api
pnpm preview:deploy --stage <preview-stage> --profile minimal-api
pnpm preview:outputs --stage <preview-stage>
pnpm preview:smoke --stage <preview-stage>
pnpm preview:destroy --stage <preview-stage> --profile minimal-api --dry-run
pnpm preview:destroy --stage <preview-stage> --profile minimal-api --confirm <preview-stage>
pnpm preview:cleanup --dry-run
```

`just preview-*` wrappers are **not** part of the allowed surface today. They may be added
later as thin convenience wrappers over the `pnpm preview:*` commands; until they exist and
are documented here, use the `pnpm` commands above.

## Forbidden commands

Do **not** run any of the following as part of AI-assisted preview work:

```bash
cdk deploy --all
cdk destroy --all
pnpm --filter @agentra/infra-cdk cdk deploy --all
pnpm --filter @agentra/infra-cdk cdk destroy --all
aws cloudformation delete-stack ...
aws cloudformation delete-change-set ...
aws iam create-role ...
aws iam put-role-policy ...
aws iam attach-role-policy ...
aws s3 rb --force ...
```

In addition:

- Do not deploy to `prod`, `production`, `staging`, `demo`, `dev`, `main`, `master`, `shared`.
- Do not bypass preview stage validation.
- Do not edit preview scripts to loosen validation as part of unrelated work.
- Do not delete AWS resources manually to fix cleanup unless a human explicitly instructs it.

## Stage naming

Stage names are validated by the guardrail library in
[`scripts/preview/`](../../scripts/preview/README.md), which is the **source of truth**.
Keep this section consistent with that README.

| Pattern | Regex | Example |
|---------|-------|---------|
| Pull request | `^pr-[0-9]+$` | `pr-307` |
| Sandbox | `^sandbox-[a-z0-9-]+-[0-9]{12}$` | `sandbox-nakatsuka-202605282130` |
| Local | `^local-[a-z0-9-]+-[a-f0-9]{7,12}$` | `local-nakatsuka-a1b2c3d` |

**Forbidden stage names** (rejected regardless of case): `prod`, `production`, `staging`,
`stage`, `demo`, `dev`, `main`, `master`, `default`, `shared`.

**Recommended local AI stage format:**

```text
local-<user>-<short-sha>
```

Example:

```bash
pnpm preview:plan --stage local-nakatsuka-a1b2c3d --profile minimal-api
```

### Profiles

| Profile | Scope |
|---------|-------|
| `minimal-api` (default) | BFF/API + minimal data/auth/artifact resources |
| `backend-ai` | `minimal-api` + AgentCore runtime integration |
| `full` | `backend-ai` + frontend hosting if practical |

### TTL policy

- Minimum: 1 hour
- Maximum: 24 hours
- Default: 8 hours

## Standard local workflow

The expected flow is **plan → deploy → smoke → report → destroy**:

```bash
pnpm preview:plan --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:deploy --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:smoke --stage local-nakatsuka-a1b2c3d
pnpm preview:destroy --stage local-nakatsuka-a1b2c3d --profile minimal-api --confirm local-nakatsuka-a1b2c3d
```

`preview:destroy` requires the same `--profile` used for deploy so CDK synthesizes the
same stack set.

If the agent needs to keep the environment for human review instead of destroying it, it
must state:

```text
Preview environment kept for review:
Stage: <stage>
ExpiresAt: <timestamp>
Reason: <reason>
Destroy command: pnpm preview:destroy --stage <stage> --profile <profile> --confirm <stage>
```

## Reporting format

When an AI agent uses preview commands, include a short report in the PR body or final
response:

```text
Preview validation
- Stage: local-nakatsuka-a1b2c3d
- Profile: minimal-api
- Plan: passed
- Deploy: passed
- Smoke: passed
- Smoke result: .agentra/preview/local-nakatsuka-a1b2c3d/smoke-result.json
- Destroyed: yes
```

If the environment was not destroyed:

```text
- Destroyed: no
- Reason: kept for manual review
- ExpiresAt: <timestamp>
- Destroy command: pnpm preview:destroy --stage <stage> --profile <profile> --confirm <stage>
```

## Failure handling

- If `preview:plan` fails, do **not** deploy.
- If `preview:deploy` fails, do **not** attempt arbitrary AWS cleanup. Run
  `preview:destroy --dry-run` if available and report the failure.
- If `preview:smoke` fails, preserve `smoke-result.json` and report which checks failed.
- If `preview:destroy` fails, report the stage and error. Do **not** manually delete
  resources unless a human explicitly approves.

## Do not weaken the guardrails

The preview system is a safety boundary. Agents must **not** weaken it to make a task pass:

- Do not edit `scripts/preview/preview-stage.ts` (or its validation) to accept otherwise
  forbidden stage names.
- Do not remove or bypass forbidden-stage checks.
- Do not raise TTL limits beyond the 1–24 hour policy.
- Do not remove `--confirm` requirements or other destroy guards.
- Do not loosen preview validation as a side effect of unrelated work.

If a guardrail blocks legitimate work, stop and raise it with a human rather than disabling it.

## Safety reminders

- Preview is **disposable**, not shared dev.
- `dev` is intentionally forbidden in preview commands.
- TTL and cleanup are part of the safety model.
- Direct AWS mutation by AI agents is not part of the allowed workflow.
- The preview system is a safety boundary; do not weaken it to make a task pass.

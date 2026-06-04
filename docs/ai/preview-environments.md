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
| [#319](https://github.com/salty-vanilla/agentra/issues/319) | GitHub Actions manual preview deploy/destroy workflow | Implemented |
| [#320](https://github.com/salty-vanilla/agentra/issues/320) | Preview cleanup and stale environment detection | Implemented |
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
pnpm preview:cleanup --dry-run --stage <preview-stage>
```

`pnpm preview:cleanup --execute` (and its `--confirm` form) is destructive and is **not**
part of the routine AI-assisted surface — use dry-run for detection and reporting. See
[Preview cleanup](#preview-cleanup-stale-environment-detection) below.

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

## requestId / traceId log correlation smoke

`preview:smoke` is the sanctioned way to validate live AWS behavior for the chat path,
including end-to-end `requestId` propagation into AgentCore Runtime CloudWatch Logs. There
is **no** separate standalone live-smoke script or workflow — this capability is integrated
into the existing preview smoke.

- **Smoke depth (`--mode`).** Smoke defaults to `--mode core` (cheap GETs: `bff.health`,
  `bff.threads`). The heavy checks that invoke the agent / Bedrock or query CloudWatch
  (`bff.chatSse`, `agentcore.invoke`, `bff.chatLogCorrelation`) only run under `--mode full`;
  in core mode they are recorded as `skipped` with a reason. Use `core` for routine/CI runs
  and `full` for nightly / pre-demo / label-gated live validation.
- **Auth.** The `/chat` and `/threads` checks need a Cognito access token in
  `SMOKE_JWT_TOKEN`; without it they `skip` with a reason (no test users are created).
- **Default smoke** (`pnpm preview:smoke --stage <stage>`) runs core mode only. Add
  `--mode full` to verify `/chat` SSE reaches a terminal `done` and extract the `requestId`
  (plus `traceId` / `threadId` when present) into `smoke-result.json`. It makes no CloudWatch
  calls unless log correlation is also enabled.
- **Opt-in log correlation.** With `--mode full`, add `--with-log-correlation` (or
  `SMOKE_LOG_CORRELATION=true`) to run the `bff.chatLogCorrelation` check, which polls
  CloudWatch Logs for the same `requestId` and confirms `agent_request_start` plus
  `agent_request_end` / `agent_request_error`:

  ```bash
  SMOKE_JWT_TOKEN=... \
  SMOKE_CLOUDWATCH_LOG_GROUP_NAMES=/aws/bedrock-agentcore/runtimes/agentcore-<stage> \
  pnpm preview:smoke --stage <stage> --mode full --with-log-correlation
  ```

  Log groups come from the manifest output `agentCoreLogGroupNames` if present, else the
  comma-separated `SMOKE_CLOUDWATCH_LOG_GROUP_NAMES`. Tune timing with
  `SMOKE_LOG_WAIT_SECONDS` (default 60) and `SMOKE_LOG_POLL_INTERVAL_SECONDS` (default 5);
  CloudWatch ingestion lags, so the check polls/retries.
- **Secrets never leak.** Only safe diagnostics (check name/status/reason/endpoint/latency,
  `events`, `requestId` / `traceId` / `threadId`, `matchedLogGroupNames`, and the
  `sawRequestStart` / `sawRequestEnd` / `sawRequestError` booleans) are written. Raw prompts,
  raw responses, auth tokens, JWTs, secrets, and full log message bodies are not.

**Require `--with-log-correlation` as an acceptance condition** for changes touching:

- API Gateway / Streaming API
- Lambda Web Adapter / SSE transport
- `postChat`
- requestId / traceId propagation
- AgentCore Runtime structured logs
- CloudWatch Logs / observability wiring

## GitHub Actions workflow

The same `pnpm preview:*` contract is exposed as a **manual** GitHub Actions workflow,
[`Preview Environment`](../../.github/workflows/preview-environment.yml)
(`workflow_dispatch`). It is the sanctioned CI path for preview work: it only orchestrates
the preview scripts (no raw whole-account `cdk` mutation, no direct `aws` calls), uses
**GitHub OIDC** to assume a preview role (no long-lived keys), runs under
`environment: preview`, and serializes operations per stage.

Run it from **Actions → Preview Environment → Run workflow** with inputs:

| Input | Notes |
|-------|-------|
| `action` | `plan`, `deploy`, `smoke`, or `destroy` |
| `stage` | a valid preview stage (`pr-*`, `sandbox-*`, `local-*`) |
| `profile` | `minimal-api` (default), `backend-ai`, `full` |
| `ttlHours` | 1-24, default `8` |
| `prNumber` | optional; best-effort status comment on that PR |

Configuration:

- **Required secret:** `AWS_PREVIEW_ROLE_ARN` — OIDC preview role ARN (e.g.
  `agentra-github-preview-deploy-role`); the workflow fails fast if unset.
- **Optional vars/secrets:** `AWS_REGION` (default `us-east-1`),
  `AGENTRA_PREVIEW_ALLOWED_ACCOUNTS`, `SMOKE_JWT_TOKEN`.

Behavior notes:

- **smoke needs a prior deploy.** A standalone `smoke` restores `manifest.json` from the
  **latest successful `deploy` artifact for the same stage**, so deploy must have run for
  that stage first.
- **Per-stage serialization.** `concurrency: preview-<stage>` with
  `cancel-in-progress: false` prevents deploy and destroy from running against one stage
  at the same time. Each run uploads `.agentra/preview/<stage>/` artifacts.
- Validate workflow changes with `pnpm test:preview`, `pnpm typecheck:preview`,
  `pnpm lint`.

## Preview cleanup (stale environment detection)

Disposable preview stacks outlive their usefulness when a run fails halfway, a PR closes
without teardown, or a developer forgets to destroy. `pnpm preview:cleanup` detects stale
stacks **account-wide** by TTL and safety status, and (in `--execute` mode) tears down only
those that are both expired and safe.

```bash
pnpm preview:cleanup --dry-run                       # account-wide detection, no mutation
pnpm preview:cleanup --dry-run --stage pr-307        # scope to one stage
pnpm preview:cleanup --execute --confirm all         # destroy all expired+safe stacks
pnpm preview:cleanup --execute --stage pr-307 --confirm pr-307
```

Each candidate is classified using **its own `Stage` tag** (validated before use) into one
of four buckets, and a JSON report is written to
`.agentra/preview/cleanup/<timestamp>/cleanup-{dry-run,result}.json`:

| Bucket | Meaning | Deleted? |
|--------|---------|----------|
| `eligibleExpired` | passes name + tag + stage validation **and** `ExpiresAt < now` | yes (execute only) |
| `activeNotExpired` | valid but still within TTL | no |
| `rejectedUnsafe` | tags present but a safety check failed (wrong value, name/tag mismatch, malformed `Stage`/`ExpiresAt`) | no |
| `missingTags` | a required identifying tag (`Project`, `EnvironmentType`, `Stage`, `ExpiresAt`) is absent | no |

Safety properties:

- A stack is only eligible when **both** its CloudFormation name is under
  `AgentraPreview-<stage>-` **and** its tags identify it as an Agentra preview stack — the
  same two-layer guard as `preview:destroy` (#317). Tags alone are never sufficient.
- Dry-run is the default and never mutates. `--execute` requires `--confirm all`
  (account-wide) or `--confirm <stage>` (scoped). An execute run with zero eligible stacks
  is a clean no-op.
- `--execute` destroys expired stacks via `cdk destroy` for explicit validated names (never
  `--all`), grouped by stage. Because an account-wide run cannot know each stage's original
  deploy profile, it synthesizes with the **`full`** profile. This **assumes a `full` synth
  contains every preview profile's stack names** (deterministic `AgentraPreview-<stage>-<Suffix>`)
  so `cdk destroy` can resolve them. Validate this against a throwaway expired stage before
  relying on execute.

A **manual** workflow, [`Preview Cleanup`](../../.github/workflows/preview-cleanup.yml)
(`workflow_dispatch`), orchestrates the same command. **Scheduled destructive cleanup is
intentionally not enabled** (no `cron` trigger); a scheduled `--execute` is a deliberate
follow-up under #313, gated on the execute path being well exercised.

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

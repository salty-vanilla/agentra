# Preview Stage Guardrail Library

Standalone TypeScript utilities for validating and resolving preview environment configuration. No AWS SDK or CDK dependencies.

## Allowed Stage Patterns

| Pattern | Regex | Example |
|---------|-------|---------|
| Pull request | `^pr-[0-9]+$` | `pr-307` |
| Sandbox | `^sandbox-[a-z0-9-]+-[0-9]{12}$` | `sandbox-nakatsuka-202605282130` |
| Local | `^local-[a-z0-9-]+-[a-f0-9]{7,12}$` | `local-nakatsuka-a1b2c3d` |

## Forbidden Stage Names

The following names are rejected regardless of case: `prod`, `production`, `staging`, `stage`, `demo`, `dev`, `main`, `master`, `default`, `shared`.

## Preview Profiles

| Profile | Scope |
|---------|-------|
| `minimal-api` (default) | BFF/API + minimal data/auth/artifact resources |
| `backend-ai` | `minimal-api` + AgentCore runtime integration |
| `full` | `backend-ai` + frontend hosting if practical |

## API

```ts
import {
  validatePreviewStage,
  isPreviewStage,
  resolvePreviewConfig,
} from './preview-stage.js';

// Throws on invalid stage
validatePreviewStage('pr-307');

// Returns boolean
isPreviewStage('prod'); // false

// Returns full config with tags and stackPrefix
const config = resolvePreviewConfig({
  stage: 'pr-307',
  profile: 'minimal-api',
  ttlHours: 8,
  owner: 'nakatsuka',
  source: 'github-actions',
});
// config.stackPrefix === 'AgentraPreview-pr-307'
// config.tags.EnvironmentType === 'preview'
```

## TTL Policy

- Minimum: 1 hour
- Maximum: 24 hours
- Default: 8 hours

## Local Preview Commands

Four commands create, inspect, and tear down disposable preview environments. They
reuse the guardrails above and drive the CDK preview context
(`environmentType=preview`, `AgentraPreview-<stage>-*` stacks). All artifacts are
written under `.agentra/preview/<stage>/` (gitignored).

```bash
pnpm preview:plan    --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:deploy  --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:outputs --stage local-nakatsuka-a1b2c3d
pnpm preview:smoke   --stage local-nakatsuka-a1b2c3d
pnpm preview:destroy --stage local-nakatsuka-a1b2c3d --profile minimal-api --dry-run
pnpm preview:destroy --stage local-nakatsuka-a1b2c3d --profile minimal-api --confirm local-nakatsuka-a1b2c3d
```

Optional `just` wrappers (preview profile vs AWS credentials profile are separate):

```bash
just preview-plan   STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
just preview-deploy STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
just preview-outputs STAGE=local-nakatsuka-a1b2c3d
just preview-smoke STAGE=local-nakatsuka-a1b2c3d
just preview-destroy-dry-run STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
just preview-destroy STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
```

`preview-smoke` takes no `PROFILE` — the preview profile is read from `manifest.json`.

| Flag / variable | Meaning |
|-----------------|---------|
| `--profile` / `PROFILE` | Preview **profile**: `minimal-api`, `backend-ai`, or `full` |
| `AWS_PROFILE` / `AGENTRA_AWS_PROFILE` | AWS **credentials** profile used to call AWS / CDK |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | Target region (required) |
| `AGENTRA_PREVIEW_ALLOWED_ACCOUNTS` | Optional comma-separated account allowlist |

### `preview:plan`

Validates stage/profile/TTL, asserts AWS identity, prints the deploy target, runs
`cdk synth` for the preview context, lists the intended preview stacks, and writes
`plan.json`. **Read-only against AWS — never creates or mutates resources.**

### `preview:deploy`

Performs all of `plan`'s validation, then runs `cdk deploy` for the **explicit
preview stack names only** (never `--all`), writing `cdk-outputs.json` and
`manifest.json`.

### `preview:outputs`

Reads `cdk-outputs.json`, normalizes recognized outputs, refreshes `manifest.json`,
and writes `env.backend` / `env.frontend`. **Does not call AWS or CDK.** Missing
outputs are omitted — no values are invented.

### `preview:smoke`

Runs a fast liveness smoke against a **deployed** preview stage. Reads
`manifest.json` (or an explicit `--manifest <path>`); the preview profile comes from
the manifest, so there is no `--profile` flag. **Performs no deploy or destroy.**
Only checks whose required outputs are present (and that apply to the profile) run;
the rest are recorded as `skipped` with a reason. Results are written to
`smoke-result.json` with an overall `status` plus a `{ passed, failed, skipped }`
summary; the command exits non-zero when the overall status is `failed`.

| Check | Runs when | Verifies |
|-------|-----------|----------|
| `bff.health` | `bffApiUrl` present | `GET /health` returns 2xx with `status: ok` |
| `bff.threads` | `bffApiUrl` present and `SMOKE_JWT_TOKEN` set | `GET /threads` returns 200 with a `threads` array |
| `bff.chatSse` | `streamingApiUrl` present and `SMOKE_JWT_TOKEN` set | `POST /chat` SSE opens and reaches a terminal `done` event |
| `agentcore.invoke` | profile `backend-ai`/`full` and `agentCoreRuntimeArn` present | AgentCore runtime invocation returns a usable, error-free stream |

Auth uses `SMOKE_JWT_TOKEN` (a Cognito access token); checks that need it `skip` with
an explicit reason when it is absent — no real test users are created. Optional env:
`SMOKE_PROMPT`, `SMOKE_THREAD_ID`, `AGENTCORE_RUNTIME_QUALIFIER` /
`SMOKE_AGENTCORE_QUALIFIER` (default `prod`), `SMOKE_AGENTCORE_TIMEOUT_MS` (default
120000).

### `preview:destroy`

Safely tears down a preview stage. A stack is destroyed **only** when **both** layers
pass — never tags alone, never name alone:

1. **Name:** the CloudFormation stack name starts with `AgentraPreview-<stage>-`
   (the trailing hyphen prevents `pr-123` from matching `AgentraPreview-pr-1234-*`).
2. **Tags:** the live stack tags satisfy `Project=Agentra`, `EnvironmentType=preview`,
   `Stage=<stage>`, and a non-empty `ExpiresAt`.

Candidate tags are read first via read-only `aws cloudformation describe-stacks`;
destruction then runs `cdk destroy <validated explicit stack names> --force` (never
`--all`), so CDK resolves the cross-stack dependency order. Non-preview stacks, other
stages, and prod/demo/staging/dev/shared environments are never touched.

`--profile` is the **preview profile** and must match the profile used for the
original `preview:deploy`, so CDK synthesizes the same stack set (otherwise destroy
can fail to resolve them). It is **not** the AWS credentials profile.

- **`--dry-run`** validates the stage, asserts AWS identity, lists candidate stacks,
  runs all destroy-target checks, prints accepted/rejected stacks with reasons,
  performs **no** mutation, and writes `destroy-dry-run.json`.
- A **real destroy** requires **`--confirm <stage>`** to exactly equal `--stage`;
  otherwise it fails before any AWS call. It writes `destroy-result.json`.

Report `status`:

- **dry-run** is always `passed` (it only validates); when nothing is destroyable it
  records the reason `No destroyable stacks found for stage "<stage>"`.
- **real destroy** is `failed` when no stacks are destroyable or when `cdk destroy`
  fails (a best-effort failed report is still written), and `passed` otherwise.
- Seeing other stages' `AgentraPreview-*` stacks in `rejectedStacks` is **not** a
  failure on its own. `requestedDestroyStacks` lists the stacks handed to `cdk destroy`
  that succeeded (deletion is not post-verified).

### Artifacts

```text
.agentra/preview/<stage>/
  plan.json             # preview:plan
  cdk-outputs.json      # preview:deploy (cdk --outputs-file)
  manifest.json         # preview:deploy + preview:outputs
  env.backend           # preview:outputs
  env.frontend          # preview:outputs
  smoke-result.json     # preview:smoke
  destroy-dry-run.json  # preview:destroy --dry-run
  destroy-result.json   # preview:destroy (real run)
```

## GitHub Actions workflow

The same commands can be driven from CI via the manual
[`Preview Environment`](../../.github/workflows/preview-environment.yml) workflow
(`workflow_dispatch`). It orchestrates the `pnpm preview:*` scripts only — all stage
validation, stack targeting, and destroy guards stay in these scripts; the workflow
never runs raw whole-account `cdk` mutation.

Run it from **Actions → Preview Environment → Run workflow**, choosing:

| Input | Notes |
|-------|-------|
| `action` | `plan`, `deploy`, `smoke`, or `destroy` |
| `stage` | a valid preview stage (`pr-*`, `sandbox-*`, `local-*`) |
| `profile` | `minimal-api` (default), `backend-ai`, or `full` |
| `ttlHours` | 1-24, default `8` (used by plan/deploy) |
| `prNumber` | optional; posts/updates a best-effort status comment on that PR |

AWS access uses **GitHub OIDC** (no long-lived keys) and `environment: preview`, so
repository environment protection rules can require approval.

**Required secret**

- `AWS_PREVIEW_ROLE_ARN` — ARN of the OIDC preview role to assume (e.g.
  `agentra-github-preview-deploy-role`). The workflow fails fast if it is unset.

**Optional vars / secrets**

- `AWS_REGION` (repo variable) — target region; defaults to `us-east-1`.
- `AGENTRA_PREVIEW_ALLOWED_ACCOUNTS` (repo variable) — comma-separated account allowlist
  passed through to deploy/destroy.
- `SMOKE_JWT_TOKEN` (secret) — Cognito access token for authed smoke checks.

**deploy → smoke ordering.** `smoke` runs on a fresh runner with no manifest on disk, so
it restores `manifest.json` from the **latest successful `deploy` artifact for the same
stage** (resolved to a concrete run id, then downloaded by id). A standalone `smoke`
therefore requires a prior successful `deploy` for that stage.

**Concurrency.** Operations are serialized per stage (`concurrency: preview-<stage>`,
`cancel-in-progress: false`), so deploy and destroy can never run against one stage at
once. Every run uploads its `.agentra/preview/<stage>/` artifacts for auditability.

Validate workflow changes locally with `pnpm test:preview`, `pnpm typecheck:preview`,
and `pnpm lint`.

## AI Safety Requirements

- AI agents (Claude Code / Codex) **may** use `preview:plan`, `preview:deploy`,
  `preview:outputs`, `preview:smoke`, and `preview:destroy`. These are the allowed
  path for AWS preview work.
- Direct `cdk deploy --all` / `cdk destroy --all` are **not** allowed for AI-assisted
  preview work.
- Direct AWS mutation commands (CLI/SDK) are **not** allowed.
- `preview:destroy` is guard-railed: it destroys only explicit stacks that pass both
  the `AgentraPreview-<stage>-` name check and the required tag check, never `--all`,
  and a real destroy requires `--confirm <stage>`. Prefer `--dry-run` first to confirm
  the accepted/rejected set.

## Future

This library lives in `scripts/preview/` for now. If CDK layer code (issue #315) or a preview CLI both need to import it, it may be promoted to a dedicated pnpm workspace package (e.g. `packages/preview-config`) to make cross-workspace imports stable and explicit.

## Running Tests

```bash
pnpm test:preview       # run unit tests
pnpm typecheck:preview  # TypeScript type check
pnpm exec biome check scripts/preview/  # lint
```

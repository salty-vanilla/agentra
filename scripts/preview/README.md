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

Three commands create and inspect disposable preview environments. They reuse the
guardrails above and drive the CDK preview context (`environmentType=preview`,
`AgentraPreview-<stage>-*` stacks). All artifacts are written under
`.agentra/preview/<stage>/` (gitignored).

```bash
pnpm preview:plan    --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:deploy  --stage local-nakatsuka-a1b2c3d --profile minimal-api
pnpm preview:outputs --stage local-nakatsuka-a1b2c3d
```

Optional `just` wrappers (preview profile vs AWS credentials profile are separate):

```bash
just preview-plan   STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
just preview-deploy STAGE=local-nakatsuka-a1b2c3d PROFILE=minimal-api
just preview-outputs STAGE=local-nakatsuka-a1b2c3d
```

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

### Artifacts

```text
.agentra/preview/<stage>/
  plan.json          # preview:plan
  cdk-outputs.json   # preview:deploy (cdk --outputs-file)
  manifest.json      # preview:deploy + preview:outputs
  env.backend        # preview:outputs
  env.frontend       # preview:outputs
```

## AI Safety Requirements

- AI agents (Claude Code / Codex) **may** use `preview:plan`, `preview:deploy`, and
  `preview:outputs`. These are the allowed path for AWS preview validation.
- Direct `cdk deploy --all` is **not** allowed for AI-assisted preview work.
- Direct AWS mutation commands (CLI/SDK) are **not** allowed.
- A **destroy** command is intentionally **not** included here; teardown is handled
  separately to keep this safety surface small.

## Future

This library lives in `scripts/preview/` for now. If CDK layer code (issue #315) or a preview CLI both need to import it, it may be promoted to a dedicated pnpm workspace package (e.g. `packages/preview-config`) to make cross-workspace imports stable and explicit.

## Running Tests

```bash
pnpm test:preview       # run unit tests
pnpm typecheck:preview  # TypeScript type check
pnpm exec biome check scripts/preview/  # lint
```

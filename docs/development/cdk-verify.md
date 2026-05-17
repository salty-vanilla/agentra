# Worktree-safe CDK verification

This is the canonical workflow for deploying and verifying CDK / AgentCore / smoke
changes from a worktree without colliding with the shared `dev` stage.

## Stage naming

Stage names control the CloudFormation stack ID suffix and many resource names
(S3 buckets, log groups, Cognito domain, OpenSearch collection, etc.).

Pattern: lowercase letters, digits, and hyphens. Max 16 characters. No leading or
trailing hyphen. Enforced both in `infra/cdk/bin/agentra-cdk.ts` and in
`scripts/agent/cdk-stage.sh::validate_stage`.

| Use case | Example | Lifecycle |
|---|---|---|
| Stable shared dev | `dev` | Long-lived. Do not deploy to this from an arbitrary worktree without explicit user direction. |
| Issue worktree | `dev-issue-224` | Ephemeral. Created when starting work on an issue, destroyed before merge. |
| Codex iteration | `dev-codex-rag` | Ephemeral. Per-topic. |
| Claude iteration | `dev-claude-tool` | Ephemeral. Per-topic. |
| Personal | `dev-<username>` | Optional. Treat like a developer's local stable env. |

Protected names that `just cdk-deploy-dev` / `cdk-destroy` / `cdk-cleanup-ephemeral`
will refuse: `dev`, `prod`, `production`, `main`, `master`, `staging`, `release`.

## Stack groups

Agents do not need to remember the full stack list. `scripts/agent/cdk-stage.sh`
exposes named groups that expand to the correct stack IDs for a given stage.

| Group | Expands to |
|---|---|
| `agentcore` | `AgentraSlideRuntimeStack`, `AgentraBedrockKbStack`, `AgentraDataAuthStack`, `AgentraAgentCoreRuntimeStack` |
| `runtime` | `AgentraAgentCoreRuntimeStack` |
| `kb` | `AgentraBedrockKbStack` |
| `slide` | `AgentraSlideRuntimeStack` |
| `data` | `AgentraDataAuthStack` |
| `gateway` | `AgentraAgentCoreStack` |
| `api` | `AgentraAppStack` |
| `web` | `AgentraWebHostingStack` |
| `all` | Every stack defined in `infra/cdk/bin/agentra-cdk.ts` |

`agentcore` is the default for most just recipes — it matches the existing
`cdk-diff-agentcore` / `cdk-deploy-agentcore` behavior.

## Environment

`.env.local` (gitignored) supplies the variables the recipes need:

| Variable | Required for | Notes |
|---|---|---|
| `AGENTRA_AWS_PROFILE` | All recipes | Default: `quick-admin`. |
| `AGENTRA_STAGE` | All recipes (default) | Default: `dev`. Override per command. |
| `THIRD_PARTY_API_KEY_SECRET_ARN` | Every CDK deploy/diff | Already an existing requirement. |
| `AMPLIFY_URL` | `web` / `all` groups | When unset and stage is ephemeral, the helper auto-injects localhost callback / CORS URLs so worktree iteration works without Amplify. |
| `AMPLIFY_GITHUB_PAT`, `AMPLIFY_GITHUB_REPOSITORY`, `AMPLIFY_GITHUB_BRANCH` | `web` / `all` groups (deploy) | CloudFormation parameters for `AgentraWebHostingStack`. |
| `AGENTCORE_RUNTIME_ARN` | Smoke tests | `smoke-agentcore` / `smoke-slide` auto-load this from `.agentra/outputs/<stage>.json` when present (written by `cdk-deploy-with-outputs`). Set manually only when there is no outputs file. |
| `CONFIRM_STAGE` | `cdk-destroy`, `cdk-cleanup-ephemeral` | Must equal the target stage. Forces a human to type the stage twice. |

Per-worktree environment: keep `.env.local` in the main checkout and symlink it
into each worktree, or maintain a separate `.envrc.local` per worktree. Do not
copy secrets into committed files.

## Standard agent workflow

```bash
# 1. Preflight — confirm identity, stage, and resolved stacks.
just cdk-stage-info agentcore dev-issue-224 quick-admin

# 2. Diff what will change.
just cdk-diff agentcore dev-issue-224 quick-admin

# 3. Deploy and capture outputs.
just cdk-deploy-with-outputs agentcore dev-issue-224 quick-admin
#    → writes .agentra/outputs/dev-issue-224.json

# 4. Smoke and scan recent errors.
just smoke-agentcore dev-issue-224 quick-admin
just smoke-slide dev-issue-224 quick-admin
just agentcore-errors dev-issue-224 15m quick-admin

# Or do steps 1–4 in one go:
just verify-cdk agentcore dev-issue-224 quick-admin
```

### Faster local iteration

`just cdk-deploy-dev <group> <ephemeral-stage> <profile>` uses
`--hotswap-fallback` for sub-minute redeploys of Lambda code and similar
hot-swappable resources. It refuses stable / production stage names.

Hotswap can introduce CloudFormation drift. Before opening a PR, run:

```bash
just cdk-reconcile agentcore dev-issue-224 quick-admin
```

This re-deploys the stacks with `--revert-drift` when the installed CDK CLI
supports it; otherwise it runs a plain deploy.

## Cleanup

```bash
CONFIRM_STAGE=dev-issue-224 just cdk-cleanup-ephemeral dev-issue-224 quick-admin
```

`cdk-cleanup-ephemeral` rejects stable stages and requires
`CONFIRM_STAGE=<stage>` in the environment. It calls `cdk destroy --force` on
every stack group, so the destruction is non-interactive once the guards pass.

### Retained resources

CloudFormation removal policies leave some resources behind on purpose. After
cleanup, the following name patterns may still exist for `<stage>` and should be
inspected manually if you need a fully clean slate:

| Pattern | Source |
|---|---|
| `agentra-<stage>-manufacturing-docs` (S3) | `AgentraBedrockKbStack` |
| `agentra-<stage>-mfg-kb-vectors` (S3) | `AgentraBedrockKbStack` |
| `agentra-web-<stage>` (S3) | `AgentraWebHostingStack` |
| `/aws/bedrock-agentcore/runtimes/agentra-slide-<stage>*` (CloudWatch Logs) | `AgentraSlideRuntimeStack` |
| `/aws/bedrock-agentcore/runtimes/agentcore-<stage>*` (CloudWatch Logs) | `AgentraAgentCoreRuntimeStack` |
| `agentra-<stage>-kb-ingestion`, `agentra-<stage>-kb-ingestion-dlq` (SQS) | `AgentraBedrockKbStack` |
| `agentra-<stage>-mfg-kb` (OpenSearch Serverless) | `AgentraBedrockKbStack` |

The helpers do **not** auto-delete retained resources. Inspect them with the
AWS console or CLI and remove them manually if needed.

## PR summary template

When you used `verify-cdk` or its components, copy this block into the PR body:

```text
### CDK verification

stage:    dev-issue-224
group:    agentcore
profile:  quick-admin

commands run:
- just cdk-diff agentcore dev-issue-224 quick-admin
- just cdk-deploy-with-outputs agentcore dev-issue-224 quick-admin
- just smoke-agentcore dev-issue-224 quick-admin
- just smoke-slide dev-issue-224 quick-admin
- just agentcore-errors dev-issue-224 15m quick-admin

outputs file: .agentra/outputs/dev-issue-224.json
errors observed: <none | brief summary>
cleanup status:  <retained — CONFIRM_STAGE not run | destroyed via cdk-cleanup-ephemeral>
```

## Agent rules of thumb

1. Do not deploy from an arbitrary worktree to the shared `dev` stage without
   explicit user direction.
2. Prefer an ephemeral stage derived from the issue / topic name.
3. Run `cdk-stage-info` before any diff or deploy so the human in the loop sees
   AWS identity + target.
4. Use `cdk-deploy-dev` only for ephemeral stages, and follow up with
   `cdk-reconcile` before merging.
5. Cleanup is opt-in. Either run `cdk-cleanup-ephemeral` with `CONFIRM_STAGE` or
   document retained resources in the PR summary.

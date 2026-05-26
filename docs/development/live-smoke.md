# Live AWS Smoke Tests

Live smoke tests hit real AWS resources (API Gateway, Lambda, AgentCore Runtime,
CloudWatch Logs). They are **not** part of normal CI and must be triggered manually.

## When to run live smoke

Run `just smoke-live-chat` before merging any PR that touches:

| Change area | Required smoke |
|---|---|
| CDK stack / IAM / env var / URL contract | `smoke-live-chat` |
| API Gateway config (REST or HTTP API) | `smoke-live-chat` |
| Lambda Web Adapter / SSE transport | `smoke-live-chat` |
| AgentCore Runtime invoke path | `smoke-live-chat` |
| `requestId` / `traceId` / structured logs / CloudWatch correlation | `smoke-bff-chat-logs` |
| Generated `postChat` client / `NEXT_PUBLIC_STREAMING_API_BASE_URL` | `smoke-bff-chat` |
| Frontend API base URL wiring | `smoke-bff-chat` |

Changes that do **not** require live smoke (normal CI is sufficient):
- Unit tests, build scripts, documentation
- Frontend-only UI changes with no API contract change
- Backend refactors that keep the SSE wire format identical

## Quick start

```bash
# 1. Deploy the stage (one-time per stage)
just cdk-deploy-with-outputs agentcore dev

# 2. Generate env file from CDK outputs
just outputs-env dev bff-smoke

# 3. Run the full live smoke suite
just smoke-live-chat dev quick-admin
```

## Recipes

| Recipe | What it does |
|---|---|
| `just smoke-bff-chat <stage>` | BFF SSE smoke only (validates SSE events, extracts requestId/traceId) |
| `just smoke-bff-chat-logs <stage>` | BFF SSE smoke + requestId log correlation (polls CloudWatch) |
| `just smoke-live-chat <stage>` | Full suite: BFF SSE + log correlation |

### Env vars

The env file at `.agentra/env/<stage>/bff-smoke.env` is auto-loaded by all
`smoke-bff-*` recipes when present. Generate it with:

```bash
just outputs-env <stage> bff-smoke
```

Additional overrides:

| Var | Default | Purpose |
|---|---|---|
| `AGENTRA_STREAMING_API_BASE_URL` | (from bff-smoke.env) | Streaming API base URL |
| `AGENTRA_AUTH_TOKEN` | (none) | Cognito ID token for auth-enabled stages |
| `SMOKE_PROMPT` | built-in greeting | Prompt sent to the agent |
| `SMOKE_TIMEOUT_MS` | 300000 | SSE stream timeout |
| `SMOKE_LOG_WAIT_SECONDS` | 60 | Initial wait before CloudWatch polling |
| `SMOKE_LOG_POLL_INTERVAL_SECONDS` | 10 | Interval between CloudWatch polls |
| `SMOKE_LOG_MAX_WAIT_SECONDS` | 180 | Total CloudWatch poll budget |

## What is validated

### `smoke-bff-chat`

- `POST /chat` reaches the Streaming API (not the REST HTTP API)
- SSE `Content-Type: text/event-stream` is returned
- `thread_started` event is received with `threadId`
- At least one `text` or `observation` event is received
- `done` event is received with `threadId`, `requestId`, and optionally `traceId`
- Non-zero exit on `error` or `cancelled` events

### `smoke-bff-chat-logs` (log correlation)

All of the above, plus:

- CloudWatch Logs are polled until `requestId` is found (or timeout)
- `agent_request_start` is present in AgentCore Runtime structured logs
- `agent_request_end` or `agent_request_error` is present

### What is NOT logged

Smoke scripts never print:
- Raw prompt content
- Raw response content
- Auth tokens or credentials
- User-identifiable information

## GitHub Actions

The `.github/workflows/live-smoke.yml` workflow can be triggered manually via
`workflow_dispatch`, or automatically when a PR has the `run-live-smoke` label.

It requires:
- `secrets.AWS_LIVE_SMOKE_ROLE_ARN` — IAM role with OIDC trust for GitHub Actions
- A deployed `AgentraAppStack-<stage>` CloudFormation stack with `StreamingApiUrl` output

The workflow runs the BFF SSE smoke and optionally the log correlation step.
It is intentionally excluded from the normal `ci.yml` workflow.

## Separation from normal CI

```
normal CI (ci.yml):
  - typecheck
  - unit tests
  - build
  - cdk synth
  - post-chat URL regression test (apps/frontend/lib/__tests__)
  - mock/fixture integration tests

live smoke (live-smoke.yml / just smoke-*):
  - manual workflow_dispatch
  - PR label: run-live-smoke
  - pre-merge for changes in the trigger matrix above
```

## Troubleshooting

**BFF smoke fails with HTTP 401**
Generate and set `AGENTRA_AUTH_TOKEN` from a valid Cognito session.
In dev environments with `SKIP_AUTH=true`, no token is needed.

**Log correlation times out**
CloudWatch Logs ingestion can be delayed. Increase `SMOKE_LOG_WAIT_SECONDS`
(default: 60) or `SMOKE_LOG_MAX_WAIT_SECONDS` (default: 180).

**Log correlation finds no log groups**
The stage name must match a deployed AgentCore Runtime log group under
`/aws/bedrock-agentcore/runtimes/`. Run `just agentcore-log-groups <stage>`
to list available groups.

**Smoke passes but requestId missing from logs**
Check that the AgentCore Runtime build from PR #237 is deployed. The requestId
propagation was added in that PR.

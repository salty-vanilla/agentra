# Development Modes and Env Generation

This guide explains how to run Agentra in common development configurations by
generating local env files from CDK outputs — no manual copy-paste from the AWS
Console required.

## Overview

After deploying a stage, run:

```bash
just cdk-deploy-with-outputs <group> <stage>
just outputs-env <stage> <target>
```

`cdk-deploy-with-outputs` writes `.agentra/outputs/<stage>.json`.
`outputs-env` reads that file and writes `.agentra/env/<stage>/<target>.env`.

Both directories are gitignored — they contain account IDs, ARNs, and table names
that should not be committed.

## Targets

| Target | File written | Copy to |
|--------|-------------|---------|
| `frontend-local` | `.agentra/env/<stage>/frontend-local.env` | `apps/frontend/.env.local` |
| `frontend-api-cloud` | `.agentra/env/<stage>/frontend-api-cloud.env` | `apps/frontend/.env.local` |
| `api-local` | `.agentra/env/<stage>/api-local.env` | `apps/backend/.env.local` |
| `agent-local` | `.agentra/env/<stage>/agent-local.env` | source in shell |
| `kb-smoke` | `.agentra/env/<stage>/kb-smoke.env` | source in shell |
| `bff-smoke` | `.agentra/env/<stage>/bff-smoke.env` | auto-loaded by `just smoke-bff-chat` |

Secret values (API keys, tokens) are never written to env files. Those are
fetched at runtime from AWS Secrets Manager.

---

## Mode 1: Frontend local + API local + AgentCore/KB cloud

All compute runs locally; only Cognito, DynamoDB, AgentCore Runtime, and Bedrock
are in the cloud. This is the fastest inner loop for frontend and API changes.

```bash
# 1. Deploy auth/data + agentcore stacks (one-time per stage)
just cdk-deploy-with-outputs agentcore <stage>

# 2. Generate env files
just outputs-env <stage> frontend-local
just outputs-env <stage> api-local

# 3. Copy frontend env
cp .agentra/env/<stage>/frontend-local.env apps/frontend/.env.local

# 4. Start both servers
just dev-backend-local <stage>  # sources api-local.env; starts on http://localhost:8080
just dev-frontend                # http://localhost:3000
```

`just dev-backend-local` sources `.agentra/env/<stage>/api-local.env` automatically,
setting `HOST`, `PORT=8080`, `STORE_TYPE`, table names, Cognito vars, and
`BEDROCK_REGION` before starting the server. No manual copying of the backend env
is needed.

The frontend talks to the local backend at `http://localhost:8080`.
The backend talks to cloud DynamoDB, Cognito, and AgentCore Runtime.

---

## Mode 2: Frontend local + API cloud

Frontend runs locally; the API (BFF + streaming) is deployed to AWS. Use this
to test the full cloud API path from a local browser.

```bash
# 1. Deploy all stacks including the API
just cdk-deploy-with-outputs all <stage>

# 2. Generate frontend env pointing to cloud API
just outputs-env <stage> frontend-api-cloud
cp .agentra/env/<stage>/frontend-api-cloud.env apps/frontend/.env.local

# 3. Start frontend only
just dev-frontend  # http://localhost:3000
```

The frontend talks to the deployed `HttpApiUrl` and `StreamingApiUrl` from CDK
outputs. Cognito CORS and callback URLs must include `http://localhost:3000` —
the `build_cdk_flags` helper injects these automatically for non-`dev` stages
when `AMPLIFY_URL` is not set.

---

## Mode 3: BFF /chat smoke test

Verify the deployed Streaming API endpoint without a browser.

```bash
# 1. Deploy the API stack
just cdk-deploy-with-outputs api <stage>

# 2. Generate bff-smoke env
just outputs-env <stage> bff-smoke

# 3. Run smoke test (env is auto-loaded)
just smoke-bff-chat <stage>

# 4. Run smoke + check AgentCore logs for requestId propagation
just smoke-bff-chat-logs <stage>
```

The `bff-smoke.env` sets:
- `AGENTRA_STREAMING_API_BASE_URL` — the deployed Streaming API (REST API) URL
- `AGENTRA_API_BASE_URL` — the deployed HTTP API URL

These are loaded automatically by `just smoke-bff-chat`; no manual export needed.

---

## Mode 4: Local AgentCore process + Bedrock/KB cloud

Run the TypeScript AgentCore runtime locally against cloud Bedrock and Knowledge
Base. Useful for iterating on agent logic without a full redeploy.

```bash
# 1. Deploy KB and auth stacks (provides KB IDs)
just cdk-deploy-with-outputs kb <stage>

# 2. Generate agent-local env
just outputs-env <stage> agent-local

# 3. Source env and run the local process
source .agentra/env/<stage>/agent-local.env
eval "$(aws configure export-credentials --profile quick-admin --format env)"
pnpm --filter @agentra/agentcore-runtime-ts dev
```

---

## Mode 5: KB smoke only

Verify Knowledge Base ingestion or retrieval without deploying the full stack.

```bash
just cdk-deploy-with-outputs kb <stage>
just outputs-env <stage> kb-smoke
source .agentra/env/<stage>/kb-smoke.env
# run KB-specific scripts
```

---

## Env file reference

### `frontend-local.env`

| Variable | Value | Source |
|----------|-------|--------|
| `NEXT_PUBLIC_API_MODE` | `real` | hardcoded |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | hardcoded (local API) |
| `NEXT_PUBLIC_STREAMING_API_BASE_URL` | `http://localhost:8080` | hardcoded (local API) |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | pool ID | `AgentraDataAuthStack` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | client ID | `AgentraDataAuthStack` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Cognito domain | `AgentraDataAuthStack` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | hardcoded |

### `frontend-api-cloud.env`

Same as `frontend-local.env` but `NEXT_PUBLIC_API_BASE_URL` and
`NEXT_PUBLIC_STREAMING_API_BASE_URL` are populated from `AgentraAppStack`
CDK outputs.

### `api-local.env`

| Variable | Value | Source |
|----------|-------|--------|
| `HOST` | `127.0.0.1` | hardcoded |
| `PORT` | `8080` | hardcoded |
| `STORE_TYPE` | `dynamo` | hardcoded |
| `BEDROCK_REGION` | `ap-northeast-1` | hardcoded |
| `THREADS_TABLE_NAME` | table name | `AgentraDataAuthStack` |
| `MESSAGES_TABLE_NAME` | table name | `AgentraDataAuthStack` |
| `USERS_TABLE_NAME` | table name | `AgentraDataAuthStack` |
| `COGNITO_USER_POOL_ID` | pool ID | `AgentraDataAuthStack` |
| `COGNITO_USER_POOL_CLIENT_ID` | client ID | `AgentraDataAuthStack` |
| `COGNITO_REGION` | `ap-northeast-1` | hardcoded |
| `ALLOWED_CORS_ORIGINS` | `http://localhost:3000` | hardcoded |
| `AGENTCORE_RUNTIME_ARN` | runtime ARN | `AgentraAgentCoreRuntimeStack` (if deployed) |
| `AGENTCORE_RUNTIME_QUALIFIER` | `prod` | hardcoded (when ARN present) |
| `BEDROCK_KB_ID` | KB ID | `AgentraBedrockKbStack` (if deployed) |
| `BEDROCK_KB_REGION` | region | `AgentraBedrockKbStack` (if deployed) |

### `bff-smoke.env`

| Variable | Value | Source |
|----------|-------|--------|
| `AGENTRA_STREAMING_API_BASE_URL` | Streaming API URL | `AgentraAppStack` |
| `AGENTRA_API_BASE_URL` | HTTP API URL | `AgentraAppStack` |

# Agentra

AWS 上で動作する社内向け Agent チャットシステムの PoC / デモ用リポジトリです。

現時点のプロジェクト方針と実装方針は、以下の引き継ぎドキュメントを参照してください。

- [docs/codex-handoff.md](docs/codex-handoff.md)

## Workspace

```text
agentra/
  apps/
    frontend/                     # Next.js 15 + React 19 + TailwindCSS UI
    backend/                      # Hono web server + Lambda Web Adapter
    agentcore-runtime-ts/         # Bedrock Agent Core runtime (TypeScript)
    presentation-author-runtime/  # Presentation generation runtime
  packages/
    shared/         # OpenAPI schema (source of truth) + shared types
    agent-tools/    # Shared agent tool definitions
    presentation-author/
  infra/
    cdk/            # AWS CDK infrastructure
  scripts/
    seed/           # DynamoDB seed scripts
    generate/       # Optional data generators
  data/
    app/            # Sample users / threads / messages
    kb/             # Sample knowledge base documents
```

## Getting Started

### Using Devbox (recommended)

[Devbox](https://www.jetify.com/devbox) pins the OS/CLI tool versions required for development. Install it once, then enter a reproducible shell.

```bash
# Install Devbox (one-time)
brew install jetify-com/devbox/devbox

# Enter the reproducible dev shell
devbox shell

# Install Node dependencies
pnpm install

# Or use just (available inside devbox shell)
just install
```

Inside the Devbox shell the following tools are pinned to the versions used in CI:

| Tool | Version |
|------|---------|
| Node.js | 22.x |
| pnpm | 10.9.0 |
| just | latest stable |
| direnv | latest stable |
| AWS CLI | v2 |
| jq / yq | latest stable |
| gh | v2 |

> **Docker:** Docker Desktop or OrbStack is required separately. Devbox does not manage the Docker daemon on macOS.

### Without Devbox (minimum requirements)

If you prefer to manage tools yourself, ensure the following are installed:

- Node.js 22
- pnpm 10.9.0 (`npm install -g pnpm@10.9.0`)
- Docker (Desktop or OrbStack)
- AWS CLI v2
- `gh` CLI (optional, for issue/PR workflows)

```bash
pnpm install
pnpm dev:backend
pnpm dev:frontend
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
# edit .env.local with your values
```

`.env.local` is **not** committed to git. `THIRD_PARTY_API_KEY_SECRET_ARN` refers to an AWS Secrets Manager secret containing `TAVILY_API_KEY` and `PEXELS_API_KEY` as JSON keys.

If you use `direnv`, run `direnv allow` once after editing `.envrc`. Devbox shell activation is explicit (`devbox shell`); `direnv` loads `.env.local` automatically.

Frontend は `http://localhost:3000`、backend は `http://localhost:8787` を想定しています。

Lambda 側では `apps/backend/Dockerfile` から web server を起動し、
Lambda Web Adapter を通して `AWS_LWA_INVOKE_MODE=response_stream` で API Gateway の
streaming を有効にします。

## Development Workflow

`pnpm install` の完了時に Lefthook が有効化されます。Codex / Human 共通の品質ルールは次の通りです。

| Layer | Responsibility |
|---|---|
| Codex Hooks | AI 作業中の補助チェック |
| Lefthook | local quality gate |
| GitHub Actions CI | final enforcement |

ローカルでは次が自動実行されます。

- `pre-commit`: `pnpm biome check .`
- `pre-push`: `pnpm typecheck`

推奨 workflow は以下です。

```text
edit
↓
lint
↓
typecheck
↓
commit
↓
push
↓
CI green
↓
merge
```

GitHub Actions の `CI` は `pnpm biome check .`、`pnpm typecheck`、`pnpm test` を最終保証として実行します。local hook を bypass しても、これらが全て通らない限り main には入れません。失敗した場合は先に修正してください。

## Available Commands

```bash
# Development
pnpm dev:frontend              # Next.js dev server (port 3000)
pnpm dev:backend               # Hono dev server (tsx watch)

# Build & validate
pnpm build:shared              # Build shared package
pnpm prepare:workspace         # generate:api + build:shared
pnpm typecheck                 # TypeScript check
pnpm lint                      # Biome lint check
pnpm lint:fix                  # Biome lint with fixes
pnpm format                    # Biome format

# Testing
pnpm test                      # Run all tests
pnpm --filter @agentra/backend test     # Backend tests
pnpm --filter @agentra/frontend test    # Frontend tests

# Infrastructure
pnpm synth                     # CDK synth (dry run)

# Utilities
pnpm seed:dynamo               # Seed DynamoDB with test data
pnpm validate:openapi          # Validate OpenAPI schema
```

## AWS Deploy (Stage-Aware)

CDK は `stage` ごとに Stack 名と Cognito domain prefix を分離します。

- `stage=dev` 例: `AgentraAppStack-dev`
- `stage=prod` 例: `AgentraAppStack-prod`

必須 context:

- `stage`: deployment stage name (`dev`, `prod`, etc.). Lowercase letters, numbers, and hyphens only. Max 16 characters.
- `callbackUrls`: Cognito callback URL のCSV
- `logoutUrls`: Cognito logout URL のCSV
- `corsOrigins`: API CORS許可originのCSV
- `thirdPartyApiKeysSecretArn`: AWS Secrets Manager secret ARN. Secret must be JSON with keys: `TAVILY_API_KEY`, `PEXELS_API_KEY`. Required by AgentCore and slide runtimes.

### 1. Synth

```bash
pnpm --filter @agentra/infra-cdk exec cdk synth \
  -c stage=dev \
  -c callbackUrls=http://localhost:3000/,http://127.0.0.1:3000/ \
  -c logoutUrls=http://localhost:3000/,http://127.0.0.1:3000/ \
  -c corsOrigins=http://localhost:3000,http://127.0.0.1:3000 \
  -c thirdPartyApiKeysSecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/dev/third-party-keys-xxxxx
```

The secret must contain a JSON object with keys:
- `TAVILY_API_KEY`: Tavily API key for AgentCore runtime
- `PEXELS_API_KEY`: Pexels API key for slide generation runtime (required for slide features)

### 2. Deploy

```bash
pnpm --filter @agentra/infra-cdk exec cdk deploy --all \
  --profile quick-admin \
  --require-approval never \
  -c stage=prod \
  -c callbackUrls=https://<your-frontend-domain>/ \
  -c logoutUrls=https://<your-frontend-domain>/ \
  -c corsOrigins=https://<your-frontend-domain> \
  -c thirdPartyApiKeysSecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/prod/third-party-keys-xxxxx
```

### 3. Amplify URL確定後の再反映

Amplify の branch URL が初回デプロイ後に確定したら、その URL を `callbackUrls/logoutUrls/corsOrigins` に反映して再度 `cdk deploy` します。

### 4. AgentCore Runtime endpoint

`AgentraAgentCoreRuntimeStack-<stage>` では `RuntimeEndpoint` に `agentRuntimeVersion` を設定し、`prod` endpoint が最新 runtime version を指すようにしています。

## Architecture Overview

### Chat Flow

```
Frontend (Next.js)
    ↓
Backend API (Hono/SSE)
    ↓
AgentCore Runtime (Bedrock Agent Core)
    ↓ (invokes)
Agent Tools (Tavily search, web scraping, etc.)
    ↓
Bedrock Knowledge Base (RAG)
    ↓
Chat/Memory Storage (DynamoDB)
```

### Runtimes

**AgentCore Runtime** (`apps/agentcore-runtime-ts/`):
- Bedrock Agent Core orchestration
- Tool invocation and error handling
- Integration with shared agent tools
- Supports structured and generative RAG

**Presentation Author Runtime** (`apps/presentation-author-runtime/`):
- Generates presentation slides
- Uses Pexels API for image resources
- Works alongside AgentCore for multi-turn flows

### Data & Infrastructure

- **DynamoDB**: Conversation history, user sessions, memory
- **S3**: Knowledge base documents, session storage
- **Bedrock Knowledge Bases**: RAG with structured and generative retrieval
- **EventBridge + SQS + Lambda**: Knowledge base auto-ingestion pipeline
- **Cognito**: User authentication via AWS Amplify Gen2

## Current Scope

✅ Implemented:
- Next.js frontend with chat UI (React 19, TailwindCSS, Radix UI)
- Hono backend with Server-Sent Events (SSE) streaming
- AWS Amplify authentication (Cognito)
- DynamoDB for conversation history and sessions
- AgentCore runtime with Bedrock integration
- Agent tool definitions and execution
- Presentation author runtime for slide generation
- OpenAPI schema + type generation
- Comprehensive logging and observability
- Error handling, cancellation, and retry telemetry

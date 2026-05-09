# Agentra

AWS 上で動作する社内向け Agent チャットシステムの PoC / デモ用リポジトリです。

現時点のプロジェクト方針と実装方針は、以下の引き継ぎドキュメントを参照してください。

- [docs/codex-handoff.md](docs/codex-handoff.md)

## Workspace

```text
agentra/
  apps/
    frontend/      # Next.js app
    backend/       # Hono app for Lambda / local dev
  packages/
    shared/        # zod schema and shared types
  infra/
    cdk/           # AWS CDK app
  scripts/
    seed/          # seed scripts and notes
    generate/      # optional data generators
  data/
    app/           # sample users / threads / messages
    kb/            # sample knowledge base files
```

## Getting Started

```bash
pnpm install
pnpm dev:backend
pnpm dev:frontend
```

Frontend は `http://localhost:3000`、backend は `http://localhost:8787` を想定しています。

`pnpm install` の完了時に Lefthook が有効化され、`git commit` 時は `pnpm biome check .`、`git push` 時は `pnpm typecheck` が自動で走ります。失敗した場合は先に修正してください。

## Available Commands

```bash
pnpm dev:frontend
pnpm dev:backend
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format
pnpm --filter @agentra/infra-cdk exec cdk synth -c stage=dev
```

## AWS Deploy (Stage-Aware)

CDK は `stage` ごとに Stack 名と Cognito domain prefix を分離します。

- `stage=dev` 例: `AgentraAppStack-dev`
- `stage=prod` 例: `AgentraAppStack-prod`

必須 context:

- `stage`: `dev` or `prod`
- `callbackUrls`: Cognito callback URL のCSV
- `logoutUrls`: Cognito logout URL のCSV
- `corsOrigins`: API CORS許可originのCSV
- `tavilyApiKeySecretArn`: AgentCore runtime が読む Tavily secret の ARN
- `pexelsApiKeySecretArn`: slide runtime が読む Pexels secret の ARN, 必須ではない

### 1. Synth

```bash
pnpm --filter @agentra/infra-cdk exec cdk synth \
  -c stage=dev \
  -c callbackUrls=http://localhost:3000/,http://127.0.0.1:3000/ \
  -c logoutUrls=http://localhost:3000/,http://127.0.0.1:3000/ \
  -c corsOrigins=http://localhost:3000,http://127.0.0.1:3000 \
  -c tavilyApiKeySecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/dev/tavily-api-key-xxxxx
```

### 2. Deploy

```bash
pnpm --filter @agentra/infra-cdk exec cdk deploy --all \
  --profile quick-admin \
  --require-approval never \
  -c stage=prod \
  -c callbackUrls=https://<your-frontend-domain>/ \
  -c logoutUrls=https://<your-frontend-domain>/ \
  -c corsOrigins=https://<your-frontend-domain> \
  -c tavilyApiKeySecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/prod/tavily-api-key-xxxxx \
  -c pexelsApiKeySecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/prod/pexels-api-key-xxxxx
```

### 3. Amplify URL確定後の再反映

Amplify の branch URL が初回デプロイ後に確定したら、その URL を `callbackUrls/logoutUrls/corsOrigins` に反映して再度 `cdk deploy` します。

### 4. AgentCore Runtime endpoint

`AgentraAgentCoreRuntimeStack-<stage>` では `RuntimeEndpoint` に `agentRuntimeVersion` を設定し、`prod` endpoint が最新 runtime version を指すようにしています。

## Current Scope

- `apps/frontend`: 最小チャット UI と backend 呼び出し
- `apps/backend`: `GET /health` と `POST /chat` のダミー実装
- `packages/shared`: request / response schema
- `infra/cdk`: Hono Lambda と HTTP API の最小スタック

次のフェーズで認証、DynamoDB 履歴保存、AgentCore 接続を追加していく前提です。

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

## Available Commands

```bash
pnpm dev:frontend
pnpm dev:backend
pnpm typecheck
pnpm lint
pnpm format
pnpm synth
```

## Current Scope

- `apps/frontend`: 最小チャット UI と backend 呼び出し
- `apps/backend`: `GET /health` と `POST /chat` のダミー実装
- `packages/shared`: request / response schema
- `infra/cdk`: Hono Lambda と HTTP API の最小スタック

次のフェーズで認証、DynamoDB 履歴保存、AgentCore 接続を追加していく前提です。

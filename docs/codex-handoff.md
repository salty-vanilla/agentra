# Agentra - Codex引き継ぎ用ドキュメント

## 1. プロジェクト概要

Agentra は、AWS 上で動作する社内向けの Agent チャットシステムの PoC / デモ用リポジトリです。  
主目的は、**ChatGPT のような UI を持つ社内向け Agent アプリケーション**を構築し、以下を段階的に実現することです。

- チャット UI から Agent と対話できる
- 会話履歴を保存・再表示できる
- Bedrock / AgentCore を利用した Agent 実行ができる
- KB / 構造化 KB / MCP ツールを Agent から利用できる
- 将来的に製造ライン向けユースケースへ拡張できる

このリポジトリでは、**UI / Backend / Infra / Seed / Shared code を 1 モノレポで管理**します。

---

## 2. 現時点の採用方針

### 2.1 フロントエンド

以下を採用する。

- **Next.js**
- **Vercel AI SDK**
- **assistant-ui**

理由:

- 社内向けで SEO は不要だが、将来的な画面追加や拡張性を考えると Next.js が無難
- チャット画面自体は SPA 的に実装したい
- assistant-ui + Vercel AI SDK で ChatGPT 風 UI を素早く作れる
- Vercel AI SDK は Vercel 必須ではなく、AWS 上のみでも動作可能

### 2.2 バックエンド

以下を採用する。

- **Hono**
- **AWS Lambda**
- **Amazon API Gateway**

理由:

- 軽量な BFF / API 層として Hono が適している
- 社内向け PoC の初期段階では Lambda が十分
- Hono は認証・履歴管理・AgentCore 呼び出し集約を担当する薄い層にしたい

### 2.3 Agent 実行基盤

以下を採用する。

- **Amazon Bedrock AgentCore**

AgentCore 上で以下を扱う想定。

- 文書系 KB
- 構造化 KB
- スライド作成系 MCP
- 将来的な追加ツール

理由:

- Agent のツール選択・実行・コンテキスト保持を Agent 側に寄せたい
- Hono 側に Agent orchestration を持ち込みすぎたくない

### 2.4 インフラ

以下を採用する。

- **AWS CDK (TypeScript)**

理由:

- UI / Backend / Infra を TypeScript で揃えやすい
- 今後 AWS リソースが増えることが想定される
- モノレポでの統一感が出しやすい

### 2.5 コード品質・開発ツール

以下を導入したい。

- **pnpm**
- **TypeScript**
- **Biome**
- 必要に応じて **Vitest**
- 必要に応じて **Playwright**
- **Lefthook**

理由:

- Biome で formatter / linter を一元化したい
- モノレポ運用時のツール数を抑えたい
- 将来的に CI に乗せやすい構成にしたい
- `pre-commit` / `pre-push` をローカルで強制したい

### 2.6 ID 生成方針

このプロダクト内で新しく生成する ID は、原則として **UUIDv7 に統一**する。

- `threadId`
- `messageId`
- `traceId`
- `runId`
- 各種モック / 一時生成 ID

理由:

- 時系列ソートしやすい
- ログやストレージで追跡しやすい
- 実装箇所ごとに ID 形式がばらつくのを防げる

例外が必要な場合は、外部仕様や既存契約に合わせたうえで明示する。

---

## 3. 想定アーキテクチャ

```text
[User]
  ↓
[Next.js Frontend on Amplify Hosting]
  - assistant-ui
  - Vercel AI SDK
  ↓
[API Gateway]
  ↓
[Lambda (Hono)]
  - auth / user resolution
  - chat session API
  - chat history API
  - AgentCore invoke
  ↓
[AgentCore]
  - KB
  - structured KB
  - MCP tools
  ↓
[AWS services / knowledge sources]
```

---

## 4. 責務分離

### 4.1 Frontend の責務

- Chat UI 表示
- スレッド一覧表示
- メッセージ表示
- ユーザ入力
- ストリーミング表示
- 認証後 UI の表示制御
- API 呼び出し

### 4.2 Hono Backend の責務

- 認証済みユーザの識別
- app user の解決
- チャットスレッド CRUD
- チャットメッセージ保存
- 履歴取得
- AgentCore 呼び出し
- UI 向けレスポンス整形
- 必要に応じた権限チェック

### 4.3 AgentCore の責務

- Agent 実行
- ツール選択
- KB / structured KB / MCP の利用
- 実行中セッション / memory の活用

### 4.4 DB の責務

- ユーザ情報
- チャットスレッド
- チャットメッセージ
- 将来的なツール実行履歴
- 将来的なフィードバックや監査ログ

---

## 5. DB 方針

### 5.1 結論

**チャット履歴を保存するために DB は必要**。

AgentCore の session / memory は会話継続には使えるが、以下の用途には自前 DB が必要。

- UI のスレッド一覧表示
- 過去会話の再表示
- スレッド削除
- 将来的な検索
- 監査 / ログ用途

### 5.2 初期候補

初期 PoC では以下を第一候補とする。

- **DynamoDB**

理由:

- Lambda / Hono と相性がよい
- 初期の chat threads / messages 保存には十分
- 運用コストが比較的低い

### 5.3 将来的な再検討

以下の要件が強くなったら RDB を検討。

- 複雑な検索
- 管理画面での集計
- 多様なフィルタ条件
- リレーショナルな参照が強い場合

---

## 6. 認証・ユーザ管理方針

### 6.1 想定

- 社内向け
- ゲストユーザなし
- 認証必須

### 6.2 方針

認証には AWS のマネージド認証基盤を使う前提で設計する。  
具体的な採用候補は将来的に Cognito を想定するが、まずは API の責務境界を固める。

### 6.3 Hono 側で行うこと

- トークン検証後の app user 解決
- user_id ベースのスレッドアクセス制御
- 自分のスレッドのみ取得可能にする

---

## 7. 初期実装順序

最初から全部入れず、以下の順で縦に通していく。

### Phase 1: 最小チャット疎通

- Next.js セットアップ
- assistant-ui 導入
- Vercel AI SDK 導入
- Hono + Lambda 最小 API
- ダミー応答でチャット送受信確認

### Phase 2: 認証

- 認証導入
- Hono 側でユーザ識別

### Phase 3: 履歴保存

- DynamoDB テーブル追加
- スレッド保存
- メッセージ保存
- スレッド一覧取得
- 過去スレッド再表示

### Phase 4: AgentCore 接続

- ダミー応答から AgentCore 呼び出しへ置換

### Phase 5: KB 導入

- 文書系 KB を接続

### Phase 6: structured KB 導入

- 数値 / 状態照会系を追加

### Phase 7: MCP 導入

- スライド作成など副作用ありツールを追加

### Phase 8: 運用改善

- フィードバック
- 監査ログ
- エラーハンドリング
- レート制御
- 監視

---

## 8. ダミーデータ / Seed 方針

ダミーデータは以下の 2 種類に分ける。

### 8.1 アプリ用データ

例:

- users
- chat_threads
- chat_messages

方針:

- 初期は固定 JSON ベースでよい
- `scripts/seed` から投入できるようにする
- 完全ランダムではなく、再現性のある固定サンプルを優先する

### 8.2 KB / Agent 用データ

例:

- マニュアル
- FAQ
- エラーコード表
- センサーデータ
- structured data 用 CSV / JSON

方針:

- ランダム生成よりも、**ユースケースに基づく意味のあるサンプル**を優先する
- 将来的に生成スクリプトを導入してもよい
- まずは Git 管理できる静的ファイルを置く

---

## 9. リポジトリ構成案

```text
agentra/
  README.md
  package.json
  pnpm-workspace.yaml
  biome.json

  apps/
    frontend/
      # Next.js
      # assistant-ui
      # Vercel AI SDK

    backend/
      # Hono
      # Lambda handler
      # API implementation

  packages/
    shared/
      # 共通型
      # zod schema
      # 共通 utility

  infra/
    cdk/
      # AWS CDK app
      # stacks / constructs

  scripts/
    seed/
      # DB seed scripts
    generate/
      # optional data generators

  data/
    app/
      # sample users / threads / messages
    kb/
      manuals/
      structured/
      mock/

  docs/
    codex-handoff.md
```

---

## 10. 初期 CDK 管理対象

初期段階では以下を CDK 管理対象としたい。

- Amplify Hosting 関連設定（必要に応じて）
- API Gateway
- Lambda
- DynamoDB
- 必要に応じて IAM Role / Policy
- 将来的に Cognito
- 将来的に AgentCore 関連設定
- 将来的に knowledge source 周辺リソース

注:  
Amplify Hosting 自体の扱いは、CDK でどこまで管理するかは実装時に整理する。  
少なくとも API / DB / IAM は CDK で一元管理したい。

---

## 11. 初期 API 想定

Hono 側では以下のような API を想定する。

### chat

- `POST /chat`
  - ユーザ入力を受け取り AgentCore を呼ぶ
  - レスポンスを返す
  - 将来的にはストリーミング対応

### threads

- `GET /threads`
- `POST /threads`
- `GET /threads/:threadId`
- `DELETE /threads/:threadId`

### messages

- `GET /threads/:threadId/messages`

### health

- `GET /health`

---

## 12. 初期 DB エンティティ想定

最低限以下を持つ。

### users

- `user_id`
- `external_subject`
- `display_name`
- `created_at`

### chat_threads

- `thread_id`
- `user_id`
- `title`
- `created_at`
- `updated_at`

### chat_messages

- `message_id`
- `thread_id`
- `role`
- `content`
- `created_at`
- `agent_session_id` (optional)

将来的に以下も追加候補。

- `tool_execution_logs`
- `feedback`
- `attachments`
- `citations`

---

## 13. Codex に最初に依頼したいこと

### 優先度高

1. モノレポ初期構成作成
2. pnpm workspace 構成
3. Biome 導入
4. TypeScript 基本設定
5. `apps/frontend` の Next.js 初期化
6. `apps/backend` の Hono 初期化
7. `infra/cdk` の CDK 初期化
8. `packages/shared` の共通型パッケージ作成

### 次点

9. frontend / backend / shared 間の import パス整理
10. seed 用ディレクトリ作成
11. サンプルデータ配置
12. 最小の `/health` とダミー `/chat` API 作成
13. frontend から backend を叩く最小チャット画面作成

---

## 14. 初期の開発ルール案

- パッケージマネージャは **pnpm**
- formatter / linter は **Biome**
- 共有型は `packages/shared` に寄せる
- API の request / response は zod ベースで型を揃える
- Hono 側はできるだけ薄く保つ
- Agent の判断・ツール選択は AgentCore 側に寄せる
- ダミーデータはまず固定サンプルでよい
- いきなり複雑な認証や KB を入れすぎない

---

## 15. 最初のゴール

まず目指す最初の完成状態は以下。

- ローカルで frontend / backend が起動する
- Chat UI から送信できる
- backend のダミー応答が返る
- Biome が動く
- workspace 構成が整っている
- 以降、認証・履歴保存・AgentCore 接続を足せる土台になっている

---

## 16. 補足方針

- このリポジトリは最初から過度に分割しない
- まずは PoC に必要な最小構成を整える
- ただし後から壊れにくいよう、責務分離だけは最初に意識する
- UI / Backend / Infra / Shared / Data / Scripts を明確に分ける

---

## 17. 後続タスクメモ

- `generate:api` の実行トリガーは root 側へ一本化済み
  - 方針: `prepare:workspace`（root）で `generate:api` + `build:shared` を先に実行する
  - 補足: 同時実行競合は `scripts/generate/run-generate-api.mjs` の排他ロックで解決済み
- `@tanstack/react-virtual` は thread sidebar へ導入済み
  - 効果: スレッド件数が増えた場合でも、DOM 描画コストを抑えてスクロール性能を維持しやすい
- `nuqs` による `threadId` の URL 同期は実装済み
  - 効果: 共有リンク / ブラウザ戻る・進む / 再読込時のスレッド復元が可能
- TanStack Form は後続タスクとして残す
  - 目的: 将来の設定画面や管理画面で form state と validation を整理する
  - 方針: 現在の chat composer には入れず、設定系 UI が立ち上がる段階で採用判断する

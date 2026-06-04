# Streaming Deck Preview — Terminology, UX State Model & Event Contract

> **Epic:** [#403](https://github.com/) SDPM-like Streaming Deck Preview UX
> **Status:** MVP implemented (Route A — deterministic replay)
> **Predecessor:** [#382] Post-generation Static Deck Preview (#393–#401, #412/#413)
> **Author:** implementation pass over the slide runtime, router (agentcore-runtime-ts), BFF, and frontend.

---

## 0. TL;DR / 結論先出し

- **2つの体験を用語として明確に分離する**（#404）:
  - **Post-generation Static Deck Preview** — #382 で実装済み。PPTX 生成が**完了した後**に `artifact_manifest.deck`（`DeckResult`）から静的に描画する `DeckPreview`。
  - **Streaming Deck Preview（= Live Deck Preview）** — 本 Epic。デッキが**できあがる過程**を逐次表示する。スライドが1枚ずつ現れる SDPM 風 UX。
  - 「Live Preview」という語は **生成中に逐次更新される体験に限定**して使う。完成後の静的表示には使わない。
- **イベント契約**（#405）: 既存の chat SSE 上に `deck_progress` ラッパーイベントを追加し、`deck_preview_started` / `deck_slide_compose_ready` / `deck_preview_completed` / `deck_preview_failed` を流す。型は `@agentra/shared` の `deck-preview-events.ts` が単一の真実源で、OpenAPI にもミラーして frontend 型を生成する。
- **配線ルート（spike #406 の結論）: Route A — 決定論的リプレイ**。slide runtime は**非ストリーミング**（router が `accept: application/json` で1回呼び、単一 `result` を受ける）なので、ツール実行中の真のストリーミングは現アーキテクチャでは不可能。代わりに router がツール完了直後に、捕捉済み `DeckResult` から `deck_progress` を**決定論的にリプレイ**する。LLM はペイロード（presigned URL）に一切触れない。
- **後方互換は完全維持**: すべて additive・degrade 前提。`deck_preview_failed` や欠落イベントが起きても、既存 PPTX 生成・静的 `DeckPreview`・artifact 表示は壊れない。

---

## 1. 用語定義（#404）

| 用語 | 意味 | いつ表示されるか | 実装 |
|---|---|---|---|
| **Post-generation Static Deck Preview** | 完成済みデッキの静的プレビュー | PPTX 生成**完了後** | `components/deck-preview.tsx` `DeckPreview`（`artifact_manifest.deck` を描画） |
| **Streaming Deck Preview** / **Live Deck Preview** | 生成過程の逐次プレビュー | 生成**中** | `components/streaming-deck-preview.tsx` `StreamingDeckPreview`（`deck_progress` を fold） |
| **Deck Preview**（総称） | 上記2つの総称。文脈が曖昧なときは使わない | — | — |

**運用ルール:**
- PR / Issue / UI 文言で「Live Preview」を使うのは、**生成中に画面が逐次更新される**ことを指すときだけ。
- 完成後の表示を指すときは「Static Deck Preview」または単に「DeckPreview」と書く。

## 2. UX 状態モデル（#404）

ランタイムの実イベント列を、フロントの純粋 reducer（`lib/deck-stream.ts`）が以下の `phase` に畳み込む:

```
idle ──started──▶ planning ──first slide──▶ generating ──completed──▶ (completed)
  │                  │                          │
  └──────────────────┴──────────────────────────┴─────failed──▶ (failed, 既存スライドは保持)
```

| phase | 意味 | UI |
|---|---|---|
| `idle` | デッキ未announce | 何も描画しない |
| `planning` | `deck_preview_started` 受信、スライド0枚 | 「アウトラインを作成中…」プレースホルダ |
| `generating` | 1枚以上の compose 到着 | 最新スライドを主フレームに、`N / total` の進捗ドット |
| `completed` | `deck_preview_completed` | shell は退場、静的 `DeckPreview` に引き継ぎ |
| `failed` | `deck_preview_failed` | degrade 表示。**到着済みスライドと PPTX は保持** |

reducer は敵対的ストリーム（重複 / 遅延 / 順序入替 / deckId 混線 / started 欠落）でも throw せず破綻しないことを単体テストで保証する。

## 3. イベント契約（#405）

`@agentra/shared/deck-preview-events.ts` が単一の真実源（Zod schema + 型 + `buildDeckPreviewEvents(deck)` ヘルパ）。OpenAPI (`ChatStreamDeckProgressEvent` / `DeckPreviewEvent`) にミラーし frontend 型を orval 生成。BFF の `chat-stream.ts` union にも `deck_progress` を追加。

| event | 主なフィールド | 意味 |
|---|---|---|
| `deck_preview_started` | `deckId`, `name`, `totalSlides?` | デッキ生成開始 |
| `deck_slide_compose_ready` | `deckId`, `slug`, `index`(1-based), `totalSlides?`, `composeUrl`, `defsUrl`, `previewUrl` | 1枚分の compose が描画可能に |
| `deck_preview_completed` | `deckId`, `totalSlides` | 全スライド完了 |
| `deck_preview_failed` | `deckId`, `reason` | degrade（理由は非機微・URLを含めない） |

**不変条件:**
- `completed` 時、内容は既存 `artifact_manifest.deck`（`DeckResult`）と矛盾しない（同じ `buildDeckPreviewEvents` から導出）。
- URL フィールドは `string | null`（`undefined` ではない）— JSON を跨いで `null` が保存され、「未生成」と「存在」をレンダラが区別できる。
- malformed な `deck_progress` は BFF がドロップし、ストリーム全体は落ちない。

## 4. 配線フィージビリティ（spike #406）

### 4.1 調査結果

- `apps/presentation-author-runtime/src/agent.ts` の `BedrockAgentCoreApp` は**非ストリーミング `process` ハンドラ**。router は `accept: application/json` で呼び、PPTX 生成完了後の単一 `result`（`deck` を内包しうる）を受け取る。
- したがって**ツール実行中に slide runtime から sub-event を stream する経路は現状存在しない**（真のストリーミングには router↔runtime のコントラクト変更が必要）。
- router（`agentcore-runtime-ts`）は SSE ストリーミング層であり、`create_slide_presentation` の tool result から `DeckResult` を**決定論的に捕捉済み**（`pendingDeck`、#400）。

### 4.2 ルート比較

| ルート | 内容 | 採否 |
|---|---|---|
| **A: 決定論的リプレイ** | router がツール完了直後に捕捉済み `DeckResult` から `deck_progress` をリプレイ | ✅ **採用（MVP）** |
| B: runtime から真の progress stream | slide runtime を streaming 化し sub-event を中継 | 将来。コントラクト変更が大きい |
| C: deckId 先返し + frontend polling | 追加チャネル/ポーリング | 不採用（複雑・presigned 取得経路増） |
| D: S3/DynamoDB state polling | 別チャネル | 不採用 |

### 4.3 Route A の特性

- **決定性**: LLM は URL ペイロードに触れない（router が `pendingDeck` から構築）。
- **逐次リビール**: デッキは完成済みだが、`DECK_PREVIEW_REPLAY_PACING_MS`（既定 200ms、0 で無効）でスライド間に間隔を入れ、「1枚ずつ現れる」UX を実現。
- **真のストリーミングへの継ぎ目**: runtime 側 `generateDeckPreview` の `onDeckEvent` フック（#407）が**実ステージのタイムライン**を記録済み。将来 B に移行する際の seam になる。
- **degrade**: スライドの少ない/壊れたデッキでも `started` + `completed` のみを出して安全に縮退。

## 5. 実装マップ

| レイヤ | ファイル | Issue |
|---|---|---|
| 契約 | `packages/shared/src/deck-preview-events.ts`, OpenAPI, `apps/backend/src/lib/chat-stream.ts` | #405 |
| Runtime emit | `apps/presentation-author-runtime/src/deck/deck-preview.ts`（`onDeckEvent`） | #407 |
| Relay | `agentcore-runtime-ts/src/agent.ts`（`emitDeckProgressEvents`）, `backend/src/lib/bedrock-agent.ts`, `backend/src/app.ts` | #408 |
| Frontend | `apps/frontend/lib/deck-stream.ts`, `components/streaming-deck-preview.tsx`, `assistant-ui/thread.tsx`, `agentra-workspace.tsx` | #409, #410 |
| Infra flag | `PRESENTATION_DECK_PREVIEW_ENABLED`（runtime）, `DECK_PREVIEW_REPLAY_PACING_MS`（router） | #412/#413 |

## 6. Out of scope（MVP）

- component 単位の `changed` 差分アニメーション
- スライド局所修正 UI
- Deck 一覧 / Deck 管理画面
- semantic slide IR
- 真のツール実行中ストリーミング（Route B）

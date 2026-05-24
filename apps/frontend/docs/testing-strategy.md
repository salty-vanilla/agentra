# Frontend Testing Strategy

## コマンド早見表

| コマンド | 目的 | 実行タイミング |
|----------|------|----------------|
| `pnpm --filter @agentra/frontend typecheck` | TypeScript 型エラー検知 | ローカル開発・CI (PR 毎) |
| `pnpm --filter @agentra/frontend test` | Vitest ユニット / コンポーネントテスト | ローカル開発・CI (PR 毎) |
| `pnpm --filter @agentra/frontend test --watch` | ウォッチモード (TDD サイクル) | ローカル開発時 |
| `pnpm --filter @agentra/frontend build-storybook` | Story のコンパイル・ビルド検証 | CI (PR 毎) |
| `pnpm dev:storybook` | ビジュアル確認 (ホットリロード) | ローカル開発時 |
| `pnpm --filter @agentra/frontend e2e` | Playwright E2E テスト | リリース前・主要フロー確認時 |

## テスト種別と責務

### 1. Vitest ユニット / コンポーネントテスト (`test`)

- **対象**: 純粋関数 (`lib/`)、Presenter コンポーネント、カスタムフック
- **ツール**: Vitest + React Testing Library + jsdom
- **方針**:
  - Presenter は props を渡してレンダリング結果を検証する
  - フックは `renderHook` で副作用まで確認する
  - API 呼び出しを含む Container は MSW でインターセプトする

### 2. Storybook ビルド検証 (`build-storybook`)

- **対象**: `*.stories.tsx` として定義されたすべての UI 状態
- **方針**:
  - コンパイルエラーを PR でキャッチする品質ゲート
  - Story が通らないコンポーネントは「Storybook 化できない = 過結合」のシグナル
  - ビジュアルの正しさは `dev:storybook` でローカル確認する

### 3. E2E テスト (`e2e`)

- **対象**: チャット送信→応答受信、スレッド作成・切り替えなど主要ユーザーフロー
- **ツール**: Playwright
- **方針**:
  - リリース前に実行する回帰チェック
  - CI では現在任意実行 (コスト・実行時間のトレードオフ)

## VRT (Visual Regression Testing) オプション

現時点では **Option C (build-storybook のみ)** を採用している。
Chromatic は将来の選択肢として文書化済み。

| Option | 手段 | コスト | 検知範囲 | 採用状況 |
|--------|------|--------|----------|----------|
| A — Chromatic | 外部 SaaS、Storybook ネイティブ統合 | 有料 (スナップショット課金) | ピクセル差分・レイアウト崩れ | 未導入 |
| B — Playwright スクリーンショット | セルフホスト、CI で実行 | CI リソース消費大 | ピクセル差分 | 未導入 |
| C — build-storybook のみ | 既存 CI ジョブ | 低コスト | コンパイルエラー・型エラーのみ | **現在採用** |

### Option A (Chromatic) の導入条件

以下のいずれかが満たされた場合に再評価する:

- UI コンポーネント数が 30 を超え、手動ビジュアル確認のコストが無視できなくなった
- デザインシステムの変更頻度が高まり、リグレッション検知の自動化が必要になった
- Chromatic の OSS プランまたは社内予算が確保された

## MSW とテスト環境

### Storybook (ブラウザ)

`msw-storybook-addon` が Service Worker を使って `fetch` をインターセプトする。
ストーリーごとに `parameters.msw.handlers` でハンドラーを上書きできる。

```tsx
export const WithData: Story = {
  parameters: {
    msw: { handlers: [storybookThreadsHandler] },
  },
};
```

### Vitest (Node.js / jsdom)

`msw/node` の `setupServer()` でテストごとにハンドラーをリセットする。

```ts
// test/msw-server.ts
import { setupServer } from 'msw/node';
export const mswServer = setupServer();

// test/setup.ts
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
```

## PR チェックリスト

新規・変更 UI コンポーネントを含む PR は以下を確認する。

- [ ] `pnpm --filter @agentra/frontend typecheck` が通る
- [ ] `pnpm --filter @agentra/frontend test` が通る (既存テストのリグレッションなし)
- [ ] `pnpm --filter @agentra/frontend build-storybook` が通る
- [ ] 新規 Presenter には Story が存在する
- [ ] loading / empty / error / long content の各状態を Story または test で確認した
- [ ] API 呼び出しは hook / container に閉じ込め、Presenter は props-only になっている

---

関連ドキュメント: [frontend-architecture.md](./frontend-architecture.md)

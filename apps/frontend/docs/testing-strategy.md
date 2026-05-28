# Frontend Testing Strategy

## コマンド早見表

| コマンド | 目的 | 実行タイミング |
|----------|------|----------------|
| `pnpm --filter @agentra/frontend typecheck` | TypeScript 型エラー検知 | ローカル開発・CI (PR 毎) |
| `pnpm --filter @agentra/frontend test` | Vitest ユニット / コンポーネントテスト | ローカル開発・CI (PR 毎) |
| `pnpm --filter @agentra/frontend test --watch` | ウォッチモード (TDD サイクル) | ローカル開発時 |
| `pnpm --filter @agentra/frontend build-storybook` | Story のコンパイル・ビルド検証 | CI (PR 毎) |
| `pnpm --filter @agentra/frontend test-storybook` | Storybook インタラクションテスト | CI (PR 毎) / ローカル |
| `pnpm dev:storybook` | ビジュアル確認 (ホットリロード) | ローカル開発時 |

> **E2E テスト (Playwright) は現時点で未配線。** `apps/frontend/package.json` に `e2e` スクリプトは存在しない。
> Playwright の導入・主要フローのテスト化は今後の Issue で対応予定。

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

### 3. E2E テスト (Playwright — 将来対応)

- **対象**: チャット送信→応答受信、スレッド作成・切り替えなど主要ユーザーフロー
- **ツール**: Playwright (未配線)
- **方針**:
  - リリース前に実行する回帰チェックとして導入予定
  - `apps/frontend/package.json` への `e2e` スクリプト追加と CI 組み込みは今後の Issue で対応

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

## Storybook インタラクションテスト (`test-storybook`)

Storybook の `play` function はユーザー操作 (クリック・タイピング) をシミュレートし、DOM の状態をアサートする。
`@storybook/test-runner` がすべての `play` 付き Story を Playwright 経由でヘッドレス実行する。

### コマンド早見表 (追記)

| コマンド | 目的 | 実行タイミング |
|----------|------|----------------|
| `pnpm --filter @agentra/frontend test-storybook` | Storybook インタラクションテスト実行 | ローカル (Storybook 起動後) / CI |

### ローカル実行

```bash
# ターミナル 1 — Storybook dev サーバーを起動
pnpm --filter @agentra/frontend storybook

# ターミナル 2 — Storybook が :6006 で起動したらテストを実行
pnpm --filter @agentra/frontend test-storybook
```

### ビルド済み Storybook に対して実行 (CI 相当)

```bash
pnpm --filter @agentra/frontend build-storybook
pnpm --filter @agentra/frontend storybook:serve-static &
pnpm --filter @agentra/frontend exec wait-on http://127.0.0.1:6006
pnpm --filter @agentra/frontend test-storybook:ci
```

### play function の書き方

参照実装: `apps/frontend/components/admin/kb-panel.stories.tsx` — `DeleteConfirmationOpen`

```tsx
import { expect, userEvent, within } from 'storybook/test';

export const MyStory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ポータル (ドロップダウン・ダイアログ) は document.body を使う
    const body = within(canvasElement.ownerDocument.body);

    const button = await canvas.findByRole('button', { name: /送信/ });
    await userEvent.click(button);
    expect(await body.findByText(/成功/)).toBeVisible();
  },
};
```

**ルール:**
- `findByRole` / `findByLabelText` / `findByPlaceholderText` を優先し、`findByText` による完全一致は避ける
- ポータルにレンダリングされる要素 (ドロップダウン・Sheet・Dialog) は `within(canvasElement.ownerDocument.body)` で探す
- 正規表現 (`/pattern/`) で部分一致にする — 文言変更への脆さを減らすため

---

関連ドキュメント: [frontend-architecture.md](./frontend-architecture.md)

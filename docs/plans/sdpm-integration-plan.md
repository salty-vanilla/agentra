# SDPM Slide Capability Integration Plan

> **⚠️ 方針転換あり (2026-06):** 本ドキュメントの「compose/defs だけを移植する」縦スライス方針は、Epic [#442](https://github.com/) で **SDPM Skill (Layer 1) を `PresentationAuthorEngine` 候補として取り込む** 方向へ更新された。最新の本線方針は [sdpm-skill-pivot.md](./sdpm-skill-pivot.md) を参照。本ドキュメントは #382 / #403 / #417 の表示・配信基盤の設計記録として有効。
>
> **Status:** Design only (no implementation yet)
> **Goal:** Bring SDPM's spec-driven slide generation + Live Preview capability into the **Agentra Slide Runtime** as an *SDPM-compatible generation/preview substrate* — not as a transplanted app.
> **Source:** [aws-samples/sample-spec-driven-presentation-maker](https://github.com/aws-samples/sample-spec-driven-presentation-maker) (MIT-0)
> **Author:** observation pass over both codebases (Agentra `main`, SDPM `HEAD` 2026-06-02)

---

## 0. TL;DR / 結論先出し

- **取り込む価値の核**は SDPM の **(a) Deck Workspace（deck.json + slides/{slug}.json + specs/）**、**(b) compose/defs Live Preview パイプライン**、**(c) Deck Result Schema（deckId / slides[].previewUrl / composeUrl / defsUrl / specs / pptxDownloadUrl）** の3点。
- **取り込まない**: SDPM の Remote MCP server / Web UI app / Cognito Auth / API Gateway / CDK / python-pptx **builder本体**（Agentra は既に PptxGenJS で PPTX を生成しているため、authoring engine は二重持ちしない）。
- **最大の利点**: Agentra の `presentation-author-runtime` Dockerfile には **すでに `libreoffice`（`soffice`）+ `poppler-utils` + `fonts-noto-cjk` + python venv が入っている**。LibreOffice バイナリ自体は `--convert-to svg` も可能なので、SVG export を**追加スクリプトとして**載せられる（OS 依存の追加は不要）。
- **ただし2つの未検証前提を明示**（レビュー指摘により訂正）:
  1. **Agentra に PPTX→SVG export は現状存在しない**。既存 render は `render_slides.py` による **PPTX→PDF(`soffice --convert-to pdf`)→PNG(`pdf2image`/poppler)** のみ。compose の入力となる SVG export は**新規追加**が要る。
  2. **compose/defs は engine 非依存だが LibreOffice SVG の出力構造（`g[@class='Slide']` / `g[@class='Page']` / `rect[@class='BoundingBox']` / `ooo:meta_slides` / master background）に密結合**。「任意 PPTX にそのまま適用」とは言い切れない。**Agentra runtime 内の LibreOffice が吐く SVG で compose が成立するかを、コードを書く前に spike で検証する**（PR-0）。
- **MVP の目的を「Deck 永続管理」より「Preview 成立確認」に寄せる**（レビュー指摘）。縦スライス = 「既存 `create_slide_presentation` 出力 PPTX → **LibreOffice で SVG export** → compose/defs JSON 生成 → WebP preview 生成 → Frontend で**静的** Live Preview 表示」。S3 永続・Deck Result Schema・Deck Workspace は**この成立確認の後**に固める。
- 後方互換は完全維持（新フィールドは additive、新ツールは別名、deck 生成は opt-in / degrade）。

---

## 1. 現状の責務比較（Agentra vs SDPM）

| 関心事 | Agentra (現状) | SDPM | 統合方針 |
|---|---|---|---|
| **Authoring engine** | PptxGenJS（JS authoring-script を LLM が生成→実行） `packages/presentation-author/src/authoring-script.ts` | python-pptx + JSON `builder/` + `layout/grid` | **Agentra を維持**。SDPM builder は将来オプション |
| **Slide 表現** | JS source（PptxGenJS API 呼び出し列） | 宣言的 JSON `slides/{slug}.json`（layout/placeholders/elements/notes） | **SDPM の JSON 表現を Deck Workspace として追加保存**（authoring の出力を JSON に投影 or 並走） |
| **Deck Workspace** | 一時 `workDir` のみ（揮発、run単位） | 永続 `deck.json` / `slides/` / `specs/{brief,outline,art-direction}` を S3 + DynamoDB | **新規導入**（S3 prefix `decks/{deckId}/...`） |
| **Preview / Live** | 画像レンダリング `render.ts`→`render_slides.py`（LibreOffice→PNG, diagnostics用）+ contact-sheet | **compose JSON + defs JSON + WebP**（`compose.py`: LibreOffice SVG を per-slide component に分解、PNG→WebP、fonts strip）、UI `AnimatedSlidePreview` | **compose.py を Agentra python に移植**し、既存レンダ後段に追加 |
| **PPTX→画像/SVG** | `render_slides.py`（LibreOffice headless, 既存） | `preview/backend.py`（LibreOffice headless, PDF/SVG export） | **既存 backend を共通化**。SVG export 経路のみ追加 |
| **Diagnostics / QA** | `diagnostics.ts`（overflow / fonts / render）+ revision loop | `checks/font_size.py`, `schema/lint.py`, design-review-guide | **Agentra diagnostics を維持・拡張**（コントラスト/出典/情報量へ） |
| **Brand / Style** | `brand-frame/`（registry + workspace + prompts） | `references/examples/styles/*.html`（art-direction）+ template theme | **BrandFrame を制約システムへ昇格**（template/font/color/forbidden/QA rules） |
| **Assets: icon** | `icons/`（icon-provider, svg-renderer, abstraction） | `assets/` manifest + Material/AWS icon download scripts | **Agentra icon abstraction を維持**、SDPM の `assets:`/`icons:` 参照規約だけ取り込む |
| **Assets: image** | `images/`（pexels / bedrock-image-provider 抽象） | `utils/image.py`（基本のみ） | **Agentra が優位**。Workspace の `images/` prefix へ流し込む |
| **Web 検索 / 資料読解** | `tavily.ts` / `web-research.tool.ts` / KB tools（`kb-*`） | なし | **Agentra が優位 → Research-to-Slides の根拠** |
| **Artifact / 配布** | `s3-artifact-uploader.ts`（presigned URL, `runs/{runId}/...`, ArtifactRef/ArtifactManifest, ArtifactKind） + Frontend `artifact-card.tsx` | `storage/aws.py`（`decks/{deckId}/...`, `pptx/{deckId}/...`） | **Agentra artifact 基盤を維持**、Deck 永続 prefix を追加 |
| **Runtime 形態** | Bedrock AgentCore runtime（`InvokeAgentRuntimeCommand`）、`slide-runtime-client.ts`、timeout 120s | FastMCP / Lambda + API Gateway | **Agentra AgentCore を維持** |
| **Frontend** | Next.js + assistant-ui、`artifact-card`, `slide-command-*`, `slide-progress.ts` | Next.js + `SlideCarousel`/`AnimatedSlidePreview`/`DeckDetail` | **compose/defs renderer のみ移植**、deck 一覧 UI は将来 |
| **Auth** | Amplify Gen2 / Cognito（既存） | Cognito（独自） | **Agentra を維持**（SDPM auth 不要） |
| **IaC** | Agentra CDK | SDPM CDK | **Agentra CDK を維持**（S3 prefix / DynamoDB テーブルのみ追加） |

---

## 2. 取り込むもの / 取り込まないもの

### ✅ 取り込む（価値が高く、Agentra と重複しない）
1. **Deck Workspace スキーマ**: `deck.json`（template/fonts/defaultTextColor）、`slides/{slug}.json`、`specs/{brief.md, outline.md, art-direction.html}`、`outline.md` の `- [slug] message` 規約（1スライド=1メッセージ）。
2. **compose/defs Live Preview パイプライン** (`mcp-server/tools/compose.py`): `extract_optimized_defs`（fonts strip + PNG→WebP）、`split_slide_components`（per-slide component + bbox + class + text + background 抽出）、`count_slides`。**engine 非依存だが LibreOffice SVG 構造に密結合** → spike 検証（PR-0）を前提に移植。なお `split_slide_components` は **`changed` を返さない**（`changed` は SDPM 側の差分ロジックが後段で注入するフロント向けフィールド）→ MVP の adapter は `changed:false` 固定で出す。
3. **Deck Result Schema** (`web-ui/src/services/deckService.ts` の `DeckDetail`/`SlidePreview`/`SpecFiles`): `deckId / name / slideOrder / slides[].{slug,previewUrl,composeUrl} / defsUrl / pptxUrl / specs`。
4. **Live Preview UI 契約** (`AnimatedSlidePreview.tsx`): compose `{version,viewBox,bgFill,bgSvg,components[]}` + defs `{version,defs}` から SVG を組み立て、`changed:boolean` を component 単位でアニメーションする規約。
5. **template analysis の観点**（`analyze-template` が読む layout/colors/fonts/placeholders/notes-instructions）→ BrandFrame の制約スキーマ設計の参考。
6. **`outline.md` 由来のストーリーテリング規約**（notes = 発話台本 + 末尾に出典URL、`---` 区切り）→ Research-to-Slides の出典保存に流用。

### ❌ 取り込まない（重複 or Agentra 設計と衝突）
- SDPM **Remote MCP server** (`mcp-server/`) / **mcp-local** — Agentra は AgentCore runtime ＋ Strands tools。
- SDPM **web-ui app 丸ごと**（Auth/AppShell/ChatPanel/Settings 等）— Agentra Frontend がある。移植は **compose renderer のみ**。
- SDPM **CDK/infra/api/buildspec** — Agentra CDK を使う。
- SDPM **python-pptx builder 本体**（`skill/sdpm/builder/`, `converter/`）— Agentra は PptxGenJS。**将来の代替 engine 候補としてのみ評価**（§9 将来）。
- SDPM **Cognito/AppSync/独自 storage authz**。

### ⚖️ ライセンス（MIT-0）
- LICENSE は **MIT-0**（"without restriction" + 帰属保持要求なし）。THIRD-PARTY-LICENSES は「第三者コード無し」。
- → **コードの取り込み・改変・再配布に帰属表示義務は無い**。ただし運用上の誠実さとして、移植ファイル先頭に `Adapted from aws-samples/sample-spec-driven-presentation-maker (MIT-0)` の1行コメント＋リポジトリ `NOTICE`（or `docs/THIRD-PARTY.md`）への追記を**推奨**（義務ではない）。SPDX `MIT-0` ヘッダは保持してよい。

---

## 3. 推奨アーキテクチャ

### 3.1 全体像（MVP）

```
                Agentra AgentCore Slide Runtime (presentation-author-runtime)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ create_slide_presentation (既存・無改変)                                    │
 │   → presentation-author (PptxGenJS) → workDir/output.pptx  ← 既存          │
 │                                                                            │
 │ [NEW] deck-workspace 層 (packages/presentation-author/src/deck/)           │
 │   1. workDir を Deck Workspace に投影                                       │
 │      deck.json / slides/{slug}.json / specs/{brief,outline,art-direction}  │
 │   2. [NEW] compose pipeline (python)                                       │
 │      output.pptx --[NEW] export_svg.py (soffice --convert-to svg)--> deck.svg│
 │      deck.svg --[NEW] compose_slides.py--> defs.json + {slug}.compose.json   │
 │      output.pptx --(既存 render: PDF→PNG, or WebP)--> slides/{slug}.webp     │
 │      （既存 render_slides.py は PPTX→PDF→PNG。SVG 経路は新規）              │
 │   3. [NEW] deck-store: S3 へ deck workspace + preview を永続化              │
 │      s3://<artifact-bucket>/decks/{deckId}/...                             │
 │   4. [EXTEND] Deck Result Schema を返す（既存 result に additive）          │
 └──────────────────────────────────────────────────────────────────────────┘
                                   │ InvokeAgentRuntime 戻り値 (additive)
                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ agentcore-runtime-ts: slide-runtime-client.ts                              │
 │   SlideRuntimePresentationResult に deck:{deckId, slides[], defsUrl,...} 追加│
 └──────────────────────────────────────────────────────────────────────────┘
                                   │ chat artifact event (additive ArtifactKind)
                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ Frontend: artifact-card に [NEW] DeckPreview（compose+defs renderer 移植）  │
 │   presigned previewUrl/composeUrl/defsUrl を取得しSVG合成・表示            │
 └──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 設計原則
- **Authoring は触らない**: `create_slide_presentation` → `presentation-author` の PptxGenJS 経路は無改変。Deck Workspace 層はその**出力 PPTX に対する後段（projection + preview + persist）**として追加する。これで後方互換が構造的に保証される。
- **compose pipeline は python 側に閉じる**: Agentra は既に `python-runner.ts` で python script を呼ぶ。`export_svg.py`（**新規**: `soffice --convert-to svg`、既存 `render_slides.py` の soffice 呼び出しパターンを踏襲）と `compose_slides.py`（SDPM `compose.py` 移植 + CLI 化）を `packages/presentation-author/python/` に置き、JS 側は薄い wrapper (`deck/export-svg.ts` / `deck/compose.ts`) で呼ぶ。**SVG export 経路は現状存在しないため新規**（既存 backend は PDF→PNG のみ）。
- **Deck 永続は additive な S3 prefix**: 既存 `runs/{runId}/...`（揮発 artifact）は維持。新たに `decks/{deckId}/...`（永続 workspace）を別 prefix で持つ。
- **Schema は packages/shared が source of truth**: Deck Result Schema は OpenAPI に追加し `pnpm generate:api`。Frontend 型は生成物を使う（手書きしない）。

### 3.3 データの所有境界
- **Runtime（python/JS）**: PPTX 生成・compose/defs/webp 生成・S3 アップロード・Deck Result 組み立て。
- **agentcore-runtime-ts**: passthrough（client が deck フィールドを透過）。
- **Backend (Hono BFF)**: presigned URL 発行・artifact manifest 中継（既存仕組みを deck artifact に拡張）。
- **Frontend**: 表示のみ（compose+defs→SVG 合成）。

---

## 4. データ契約案

### 4.1 Deck Workspace（S3 レイアウト）
```
s3://<agentra-artifact-bucket>/decks/{deckId}/
  deck.json                         # {template, fonts:{fullwidth,halfwidth}, defaultTextColor, name, language}
  specs/
    brief.md                        # 目的/対象/トーン（Research根拠の集約先）
    outline.md                      # "- [slug] message" 行（順序 = slideOrder）
    art-direction.html              # スタイル指定（任意, BrandFrame由来でも可）
  slides/
    {slug}.json                     # MVP: 軽量 manifest のみ（下記）。完全な SDPM semantic spec は将来
    {slug}.compose.json             # [NEW] compose: {version,viewBox,bgFill,bgSvg,components[]}
  preview/
    defs.json                       # [NEW] {version, defs}（deck共通, fonts strip + WebP化済）
    {slug}.webp                     # [NEW] per-slide ラスタ preview
  pptx/
    {epoch}.pptx                    # 生成済 PPTX（epoch-keyed で履歴/キャッシュバスト）
```
> 既存の `runs/{runId}/...`（揮発 artifact、source-js / contact-sheet / rendered-slide）はそのまま共存。

> **`slides/{slug}.json`（MVP の軽量 manifest）** — PptxGenJS 出力 PPTX から semantic な SDPM slide spec（title/body/figure の意味・layout 意図・出典対応・visual intent・notes 構造・1スライド1メッセージ対応）を**後段で安定復元するのは困難**（レビュー指摘）。MVP では復元を試みず、以下の最小形に留める。完全な SDPM 互換 spec は**「生成前 IR（intermediate representation）」を導入してから**扱う（将来）。
> ```json
> { "slug": "slide-1", "index": 1, "title": null,
>   "previewKey": "decks/{deckId}/preview/slide-1.webp",
>   "composeKey": "decks/{deckId}/slides/slide-1.compose.json" }
> ```

### 4.2 Deck Result Schema（Runtime → client → Frontend、すべて additive）
```jsonc
// SlideRuntimePresentationResult に追加（既存フィールドは不変）
{
  // ... 既存: success, summary, workDir, pptxPath, pptxDownloadUrl, diagnosticsStatus, ...
  "deck": {
    "deckId": "01J...",                       // uuidv7
    "name": "AgentCore 入門",
    "language": "ja",
    "slideOrder": ["intro", "problem", "solution"],
    "defsUrl": "https://...preview/defs.json?presigned",   // presigned (TTL 3600s)
    "pptxDownloadUrl": "https://...pptx/{epoch}.pptx?presigned",
    "specs": {
      "brief":  "https://...specs/brief.md?presigned",
      "outline":"https://...specs/outline.md?presigned",
      "artDirection": null
    },
    "slides": [
      {
        "slug": "intro",
        "previewUrl": "https://...preview/intro.webp?presigned",
        "composeUrl": "https://...slides/intro.compose.json?presigned"
        // MVP: compose の各 component は changed:false 固定。changedComponents は局所修正フェーズ（将来）で追加
      }
    ],
    "version": 1
  }
}
```

### 4.3 compose / defs JSON（Frontend renderer 契約 — SDPM 互換）
```jsonc
// {slug}.compose.json
{ "version": 1, "viewBox": "0 0 33867 19050", "bgFill": "#232F3E", "bgSvg": "<g.../>|null",
  "components": [ { "class": "TitleText", "bbox": {"x":..,"y":..,"w":..,"h":..},
                   "text": "...", "svg": "<g.../>", "changed": false } ] }
// preview/defs.json
{ "version": 1, "defs": "<defs>...</defs>" }   // fonts 除去 + PNG→WebP 済み
```

### 4.4 ArtifactKind 追加（既存 enum に additive）
`deck-compose` / `deck-defs` / `deck-preview`（or 既存 `json` / `png` を流用しつつ `metadata.role` で区別）。**enum 追加は OpenAPI 経由**。

---

## 5. MVP 範囲（最初の縦スライス）

> **MVP の目的は「Preview パイプラインの成立確認」**（レビュー指摘で再定義）。「Deck 永続管理」は MVP の主目的にしない。まず *PptxGenJS PPTX → SVG → compose/defs → WebP → Frontend 静的表示* の縦スライスが**技術的に成立すること**を確かめ、その後に永続化・Schema・Workspace を固める。

**MVP に含む（Preview 成立確認の縦スライス）**
1. 既存 `create_slide_presentation` の出力 PPTX を **LibreOffice で SVG export**（新規 `export_svg.py`）。
2. SVG → **defs.json + {slug}.compose.json** を生成（新規 `compose_slides.py`、SDPM 移植、`changed:false` 固定）。
3. PPTX → **{slug}.webp** preview 生成（既存 render を WebP 出力に拡張 or 既存 PNG を流用）。
4. Frontend に **compose+defs renderer**（`AnimatedSlidePreview` 移植、`skipAnimation=true` 既定・アニメ無し）を追加し、**静的** Live Preview を表示。
5. 既存挙動の**完全後方互換**（deck フィールドが無くても既存表示は不変、PPTX は常に返す）。

> S3 永続（`decks/{deckId}/`）・Deck Result Schema（OpenAPI）・Deck Workspace 投影は、**上記成立確認の直後**に続けて入れる（PR-3〜PR-5、§13）。MVP の「最初の価値検証」自体は spike + 静的表示で閉じる。

**MVP に含まない（将来）**
- python-pptx builder / SDPM semantic slide spec の双方向編集（→「生成前 IR」導入後）。
- 局所修正（1枚だけ・図差し替え）・diff preview・version history・**`changed` 駆動アニメ**。
- Research-to-Slides の自動出典保存・KB 再利用検索。
- 拡張 Slide QA（コントラスト/情報量/出典対応/画像妥当性）。
- Deck 一覧 UI（DeckListView/DeckCard 相当）。

---

## 6. 段階的ロードマップ

| フェーズ | テーマ | 主な成果物 | 価値 |
|---|---|---|---|
| **P-spike** | 成立確認（副作用ゼロ） | Agentra 生成 PPTX → `soffice --convert-to svg` → compose/defs JSON 生成が成立するか検証（throwaway script + fixture SVG 採取）。本線未接続 | **最大の不確実性を先に潰す** |
| **P0** | 部品・契約 | `export_svg.py` + `compose_slides.py`（純粋部品・本線未接続）、`src/deck/` scaffold、compose/defs 型、`lxml` 依存追加 | リスクなく部品確定 |
| **P1 (MVP)** | Live Preview 縦スライス（静的） | runtime 接続（feature flag）、最小 deck-store、result additive、Frontend compose renderer（`skipAnimation`） | **静的 Live Preview が見える** |
| **P2** | Deck Workspace 充実 | specs/{brief,outline,art-direction} 生成・保存、slideOrder 確定、deck 再取得 API（BFF） | Workspace として再訪可能 |
| **P3** | 局所修正 + diff preview | `changed` component 算出、1枚再生成、`AnimatedSlidePreview` アニメ有効化、version history（epoch-keyed pptx 利用） | 編集体験 |
| **P4** | Research-to-Slides | tavily/web-research/KB を brief.md/specs に根拠保存、出典→notes 末尾規約、出典対応 QA | Agentra 独自価値 |
| **P5** | Slide QA 拡張 | コントラスト/フォント/情報量/1スライド1メッセージ/画像妥当性チェック（diagnostics 拡張 + revision 連動） | 品質保証 |
| **P6** | Brand governance | BrandFrame を template/style/font/color/forbidden/QA rules の制約システム化、art-direction.html 連携 | ガバナンス |
| **P7** | Slide KB / 再利用 | deck/slide/component/source の検索・再利用（既存 KB 基盤 + S3 Vectors 候補） | 再利用 |

---

## 7. Issue 分割案（小さく分割可能）

> ラベル付与・依存順を明示。PR は各 Issue 1本を原則、大きいものは sub-PR 化。

**P-spike（最初・副作用ゼロ）**
- **#S0** `spike(sdpm-compose): Agentra 生成 PPTX の SVG→compose/defs 成立検証` — throwaway script で `soffice --convert-to svg` → SDPM compose 相当を流し、`g[@class='Slide']`/`Page`/`BoundingBox`/`ooo:meta_slides`/master bg が Agentra の LibreOffice 出力で取れるか確認。**実 SVG を fixture として採取**し、差異（NS/構造）を記録。本線・依存変更なし。成果＝「成立可否 + 必要パッチ + fixture」。

**P0（純粋部品・本線未接続）**
- **#B1a** `feat(presentation-author): PPTX→SVG export script` — `python/export_svg.py`（`soffice --convert-to svg`、既存 backend と共通化）、`src/deck/export-svg.ts`（python-runner wrapper）、fixture テスト。
- **#B1b** `feat(presentation-author): SVG→compose/defs split` — `python/compose_slides.py`（SDPM `compose.py` 移植 + CLI、`changed:false` 固定）、`src/deck/compose.ts`、`#S0` 採取 SVG fixture でゴールデンテスト。**`requirements.txt` に `lxml` 追加**。
- **#B0** `chore(presentation-author): deck/ scaffold + compose/defs 型` — `src/deck/types.ts`/`index.ts`（型 + テスト枠）。

**P1（MVP・接続）**
- **#A1** `feat(shared): Deck Result Schema を OpenAPI に追加` — Deck/SlidePreview/SpecFiles 型 + ArtifactKind 追加、`pnpm generate:api`。**compose 出力・S3 key が #S0/#B1b で確定した後**に実施（先走らない）。
- **#B2** `feat(presentation-author): 最小 deck-store + workspace 投影` — `src/deck/deck-store.ts`（S3 アップロード, presigned）、`src/deck/workspace.ts`（軽量 manifest 投影、semantic spec はやらない）。
- **#B3** `feat(slide-runtime): Deck Result を result に additive 統合（feature flag）` — executor/agent の戻りに `deck` を opt-in で載せ、失敗時 degrade。
- **#B4** `feat(agentcore-runtime-ts): slide-runtime-client に deck passthrough` — `SlideRuntimePresentationResult.deck` 透過、parse 強化、unit test。
- **#B5** `feat(frontend): DeckPreview（compose+defs renderer, 静的）` — `AnimatedSlidePreview` 移植（`skipAnimation=true` 既定）、`artifact-card` 分岐、Storybook + 単体テスト。
- **#B6** `feat(backend): deck artifact presigned URL 中継`（必要時）。

**P2+（将来、見出しのみ）**
- #C1 specs(brief/outline/art-direction) 生成・保存、#C2 BFF `GET /decks/{deckId}` 再取得、#D1 局所修正 + changed 算出 + アニメ有効化、#E1 Research→specs 出典保存、#F1 QA 拡張、#G1 BrandFrame 制約システム化、#H1 Slide KB、#I1 生成前 IR（semantic slide spec の基盤）。

依存グラフ: `#S0 → #B1a → #B1b`、`#B1b → (#A1, #B2)`、`(#B1b, #B2) → #B3 → #B4 → #B5(+#B6)`。**#A1（schema）は #S0/#B1b の後**。

---

## 8. 変更・新規ファイル

### 8.1 新規
```
packages/presentation-author/python/export_svg.py            # [NEW] PPTX→SVG (soffice --convert-to svg)
packages/presentation-author/python/compose_slides.py        # SDPM compose.py 移植 (CLI), changed:false 固定
packages/presentation-author/src/deck/types.ts               # Deck/Compose/Defs 型
packages/presentation-author/src/deck/export-svg.ts          # export_svg.py wrapper
packages/presentation-author/src/deck/compose.ts             # compose_slides.py wrapper
packages/presentation-author/src/deck/workspace.ts           # workDir → 軽量 manifest 投影（semantic spec はやらない）
packages/presentation-author/src/deck/deck-store.ts          # S3 永続 + presigned
packages/presentation-author/src/deck/index.ts
packages/presentation-author/src/__tests__/deck-compose.test.ts
packages/presentation-author/src/__tests__/deck-workspace.test.ts
packages/presentation-author/fixtures/deck/*.svg|*.pptx      # compose テスト用
apps/frontend/components/deck-preview.tsx                    # compose+defs renderer (AnimatedSlidePreview 移植)
apps/frontend/components/deck-preview.stories.tsx
apps/frontend/components/__tests__/deck-preview.test.tsx
docs/plans/sdpm-integration-plan.md                          # 本書
docs/THIRD-PARTY.md (追記)                                    # MIT-0 由来の明示（推奨）
```

### 8.2 変更（additive のみ）
```
packages/shared/openapi/*.yaml                               # Deck Result Schema + ArtifactKind 追加
packages/presentation-author/src/executor.ts (or agent)      # deck 生成を opt-in で呼ぶ
packages/presentation-author/src/types.ts                    # PresentationAuthorResult.deck?
apps/presentation-author-runtime/src/agent.ts                # result に deck を載せる
apps/presentation-author-runtime/src/tools/create-presentation.ts
apps/agentcore-runtime-ts/src/tools/slide-runtime-client.ts  # SlideRuntimePresentationResult.deck?
apps/frontend/components/artifact-card.tsx                   # deck artifact 分岐
apps/frontend/lib/generated/**                               # 生成物更新
infra/cdk/**                                                 # S3 prefix/lifecycle, (将来)DynamoDB Deck table
packages/presentation-author/python/requirements.txt         # lxml 追加（compose.py 依存）
apps/presentation-author-runtime/Dockerfile                  # OS 依存は不要だが lxml 反映の再ビルド検証
```

---

## 9. リスクと懸念（Docker / 依存 / timeout / S3 / 互換）

### 9.1 Docker / 依存
- ✅ **LibreOffice(`soffice`)/poppler/fonts は既存**（`Dockerfile` L55-59）。`docker-smoke.ts` が `soffice`/`pdftoppm` を検証済。OS 依存の追加は不要。
- ⚠️ **PPTX→SVG export は現状コードに無い**。既存 render は `render_slides.py` の PPTX→PDF→PNG のみ（`pdf2image`）。`soffice --convert-to svg` を呼ぶ `export_svg.py` を**新規追加**する（バイナリは既存なので OS 追加不要）。**MVP 受け入れ条件**: image 内で `export_svg.py` が SVG を出力できること。
- ⚠️ **`requirements.txt` に `lxml` が無い**（現状: `pdf2image / Pillow / python-pptx / numpy`）。compose.py は `lxml` 必須。**MVP 受け入れ条件**:
  - [ ] `python/requirements.txt` に `lxml` 追加（Pillow は既存）
  - [ ] `docker build` が通る
  - [ ] runtime image 内で `compose_slides.py` が実行できる
  - [ ] fixture test が CI で green
- ⚠️ SDPM SVG NS 定数（`OOO_NS = xml.openoffice.org/svg/export`）と `g[@class='Slide']`/`Page`/`BoundingBox`/`ooo:meta_slides`/master bg は **LibreOffice 出力 SVG 構造に密結合**。バージョン差で壊れる → **#S0 spike で実 SVG を採取し fixture 化、ゴールデンテスト必須**。
- ⚠️ macOS ローカル: SDPM backend は `/private/var/folders` の EDR ブロック回避で `<project>/_work` を使う設計。Agentra python-runner の cwd/tmp 方針と整合させる。

### 9.2 timeout
- 現状 `slide-runtime-client.ts` の timeout は **120s**。compose pipeline は **PPTX→SVG（LibreOffice headless）が支配的**で、スライド枚数に比例（経験的に 10-20 枚で +10〜40s）。
- → MVP は **既存 render（diagnostics 用）と LibreOffice 呼び出しを共有/直列化しすぎない**こと。SVG export は1回でデッキ全体を出すので、per-slide ループより安い。
- → 120s で不足する懸念があるなら **compose を opt-in**（`create_slide_presentation` の既定は従来通り、deck preview 要求時のみ）にし、超過時は **deck フィールドを省いて degrade**（PPTX は必ず返す）。timeout 設計は AgentCore 側の上限も確認。

### 9.3 S3 key 設計
- 揮発（`runs/{runId}/`）と永続（`decks/{deckId}/`）を**別 prefix で分離**。lifecycle policy: runs=短期 expire、decks=長期。
- `pptx/{epoch}.pptx` は **epoch-keyed**（SDPM 同様）で履歴とキャッシュバストを両立。presigned TTL は既存 3600s に合わせる。
- deckId は **uuidv7**（既存 `slide-runtime-client.ts` が uuidv7 採用済 → 一貫）。
- マルチテナント: SDPM は `user_id` で分離。Agentra は thread/session 境界。**deckId に owner を結びつける**設計（DynamoDB Deck table は P2 で導入、MVP は S3 prefix のみで可）。

### 9.4 互換性
- **絶対条件**: `create_slide_presentation` の input/output 形は不変。`deck` は **optional additive**。
- `slide-runtime-client.ts` の parse は寛容（§既存コード）なので additive フィールドは透過する。**既存 result の必須フィールドを deck 側へ移さない**。
- ArtifactKind は enum 追加のみ（削除/リネーム禁止）。Frontend は未知 kind を `other` フォールバック（`artifact-card` の `KIND_ICON ?? FileIcon` で安全）。

---

## 10. テスト計画

### 10.1 Unit
- **compose_slides.py**: 既知 SVG fixture → `count_slides` / `extract_optimized_defs`（fonts 除去・WebP 化）/ `split_slide_components`（bbox/class/text/background）をゴールデン比較。PNG→WebP は size/形式のみ assert（バイト一致は不可）。
- **deck/workspace.ts**: workDir → deck.json/specs/outline 投影（slug 衝突・空 deck・非ASCII slug）。
- **deck/deck-store.ts**: S3 put の key 構造・presigned 生成（aws-sdk-client-mock）。
- **slide-runtime-client.ts**: `deck` 透過 parse（deck 有/無、壊れた deck の degrade）。
- **shared 契約**: OpenAPI validate（`pnpm validate:openapi`）+ 生成型コンパイル。

### 10.2 Integration
- runtime 内: PptxGenJS 出力 PPTX → compose → S3（localstack or mock）→ Deck Result。**既存 create-presentation-tool テストに deck assertion を追加**（後方互換: deck 無し path も維持）。
- backend: deck preview/compose/defs の presigned download 中継。

### 10.3 後方互換テスト（必須）
- `deck` を要求しない既存呼び出しで result が**バイト等価**（新フィールド以外不変）であること。
- Frontend: deck フィールド欠如時に既存 artifact-card 表示が不変。

### 10.4 カバレッジ
- ルール（`.claude/rules/testing.md`）に従い **80%+**。新規 deck/ モジュールは TDD（RED→GREEN）。

---

## 11. Storybook / Playwright 視覚確認計画

- **Storybook**（`apps/frontend/.storybook` 既存）:
  - `deck-preview.stories.tsx`: ①静的（skipAnimation）②複数スライド③`bgSvg` 有/無④defs 共有⑤未知 component class フォールバック⑥reduced-motion。fixtures の compose/defs JSON を mock。
  - `artifact-card.stories.tsx` に deck artifact バリアント追加。
- **Playwright**（`apps/frontend/e2e`, `playwright.config.ts` 既存）:
  - チャットで slide 生成 → artifact に Live Preview 出現 → 1枚目 webp 表示 → compose→SVG 合成が DOM に存在、を E2E。
  - **視覚回帰**: `toHaveScreenshot` で deck-preview の安定スナップショット（アニメ無効・固定 viewBox）。flaky 回避に `skipAnimation` 既定＋`prefers-reduced-motion`。
- **MSW**（`apps/frontend/mocks` 既存）: deck presigned URL と compose/defs fetch を mock handler 化。

---

## 12. 既存機能を壊さない移行方針

1. **authoring 経路を一切触らない**（PptxGenJS → output.pptx は無改変）。deck 層は純後段。
2. **deck 生成は opt-in フラグ**（既定 off、または `create_slide_presentation` 別パラメータ `withDeckPreview?`）で導入し、安定後に既定 on を検討。
3. **additive-only**: schema/enum/result は追加のみ。削除・リネーム・必須化はしない。
4. **degrade 設計**: compose/SVG/S3 が失敗しても **PPTX は必ず返す**。deck は `warnings` に理由を積んで省略。
5. **Frontend は未知 kind / 欠如フィールドに耐性**（既存フォールバックを活用）。
6. **shared 変更は単独 PR（#A1）先行**で他セッションと衝突回避（CLAUDE.md の shared 調整ルール準拠）。
7. **段階リリース**: P1 を feature flag 裏で出し、Storybook/Playwright/手動 dogfood 後に露出。

---

## 13. 最初に実装すべき最小 PR（提案）

> **最初は schema ではなく spike**（レビュー指摘で順序変更）。compose が Agentra 生成 PPTX で成立するか未確定のまま schema を固めると、後で compose 出力・S3 key 変更時に修正範囲が広がる。**副作用ゼロの spike → 部品 → schema → 永続 → 接続 → UI** の順にする。

**推奨 PR 順序**

| # | PR | 内容 | 副作用 |
|---|---|---|---|
| **PR-0** | `spike(sdpm-compose): SVG→compose/defs 成立検証`（#S0） | Agentra 生成 PPTX を `soffice --convert-to svg` → SDPM compose 相当を試し、構造が取れるか確認。実 SVG を fixture 採取、必要パッチを記録 | **ゼロ**（throwaway、本線・依存変更なし） |
| **PR-1** | `feat: deck/compose module scaffold`（#B1a+#B1b+#B0） | `export_svg.py` + `compose_slides.py`（`lxml` 追加）+ `src/deck/{export-svg,compose,types}.ts`、fixture ゴールデンテスト。**本線未接続の純粋部品** | ゼロ（部品のみ） |
| **PR-2** | `feat(shared): Deck Result Schema`（#A1） | compose/S3 key 確定後に OpenAPI へ Deck/SlidePreview/SpecFiles + ArtifactKind 追加、`pnpm generate:api` | 型/契約のみ |
| **PR-3** | `feat: S3 deck-store`（#B2） | `deck-store.ts`（presigned）+ 軽量 manifest 投影 | 新規モジュール |
| **PR-4** | `feat: runtime integration behind feature flag`（#B3+#B4） | deck 生成を opt-in で result に載せ透過、失敗時 degrade | flag 裏・既定 off |
| **PR-5** | `feat(frontend): static DeckPreview`（#B5） | compose+defs renderer（`skipAnimation`）+ artifact-card 分岐 + Storybook | additive UI |

**最初に着手すべきは PR-0（#S0 spike）**。これは「compose が成立するか」という**最大の不確実性**を、コードを書く前に・副作用ゼロで潰す。成立を確認してから PR-1 以降の実装と PR-2 の schema 確定に進む。

---

## 付録A. 観察した主要ファイル（証跡）

**Agentra**
- `apps/agentcore-runtime-ts/src/tools/create-slide-presentation.ts` — Strands tool 入口（prompt/language/brandFrameId）。
- `apps/agentcore-runtime-ts/src/tools/slide-runtime-client.ts` — `SlideRuntimePresentationResult`（pptxDownloadUrl/contactSheet/rendered/diagnostics/uploadedArtifacts）, timeout 120s, uuidv7。
- `packages/presentation-author/src/{executor,authoring-script,render,python-runner,types,diagnostics,revision,contact-sheet}.ts` — PptxGenJS authoring + LibreOffice render（diagnostics）。
- `packages/presentation-author/src/{icons,images,brand-frame}/**` — icon/image/BrandFrame 抽象。
- `apps/presentation-author-runtime/Dockerfile` L55-59 — **libreoffice/poppler/fonts-noto-cjk 既存**。
- `apps/presentation-author-runtime/src/artifacts/s3-artifact-uploader.ts` — `runs/{runId}/...`, presigned, ArtifactRef。
- `apps/frontend/lib/generated/model/{artifactKind,artifactManifest,...}` — ArtifactKind enum, ArtifactManifest。
- `apps/frontend/components/artifact-card.tsx` — kind→icon、presigned download、未知 kind フォールバック。

**SDPM**
- `LICENSE`（MIT-0）/ `NOTICE` / `THIRD-PARTY-LICENSES`。
- `skill/references/workflows/slide-json-spec.md` — Deck Workspace 構造（deck.json/slides/specs）、notes 規約。
- `mcp-server/tools/compose.py` — `count_slides`/`extract_optimized_defs`/`split_slide_components`（**Live Preview の核**）。
- `skill/sdpm/preview/backend.py` — LibreOffice headless PDF/SVG export（`_work` dir）。
- `mcp-server/tools/generate.py` — `_prepare_workspace`/`generate_pptx`（S3 download→build→upload→webp）。
- `mcp-server/storage/aws.py` — S3 key（`decks/{id}/deck.json|slides/|specs/`, `pptx/{id}/`）。
- `web-ui/src/services/deckService.ts` — **Deck Result Schema**（DeckDetail/SlidePreview/SpecFiles）。
- `web-ui/src/components/deck/AnimatedSlidePreview.tsx` — compose+defs→SVG 合成 + `changed` アニメ契約。
```
```

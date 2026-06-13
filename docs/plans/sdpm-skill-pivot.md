# SDPM Skill-based Workspace-first Presentation Authoring — 方針転換ノート

> **Status:** 方針確定（実装は #444 以降）
> **Epic:** [#442](https://github.com/) SDPM Skill-based Workspace-first Presentation Authoring
> **Supersedes (方向性):** [docs/plans/sdpm-integration-plan.md](./sdpm-integration-plan.md) の「compose/defs だけを移植する」縦スライス方針
> **関連:** #382 / #403 / #417 / #441
> **Source:** [aws-samples/sample-spec-driven-presentation-maker](https://github.com/aws-samples/sample-spec-driven-presentation-maker) (MIT-0)

---

## 0. TL;DR / 結論先出し

- これまでの SDPM 統合（#382 / #403 / #417）は **「Agentra 独自 PptxGenJS authoring を維持したまま、SDPM の compose/defs・DeckPreview・SSE・snapshot polling という *表示/配信* 層だけを移植する」** 方針だった。
- 本 Epic #442 で **本線を切り替える**。今後は Agentra 独自 PptxGenJS authoring の深掘りではなく、**SDPM の Layer 1（Skill / Engine）と Workspace-first authoring workflow** を `PresentationAuthorEngine` の候補として取り込む。
- **既存基盤は捨てない。** #382 / #417 で作った DeckPreview / artifactManifest.deck / snapshot polling / in-flight snapshot authorization / S3 `decks/{deckId}/...` は、SDPM Skill が生む成果物を **表示・配信する周辺基盤** として再利用する。
- `agentra-pptxgenjs`（現行 engine）は **default / fallback / legacy** として温存し、`sdpm-skill` は **feature flag / env（`PRESENTATION_AUTHOR_ENGINE`）で opt-in 選択** にする。既存挙動は無改変。
- **取り込まない**: SDPM Web UI / Remote MCP server / Cognito Auth / API Gateway / CDK。これらは移植対象外。
- 取り込みは **最小 Spike（#444）から**。実行可能性・Python 依存・実行時間・Docker image size・MIT-0 ライセンス表記を、コードを固める前に確認する。

---

## 1. なぜ方針転換するのか / Why

### 1.1 これまでの前提と、その限界

`docs/plans/sdpm-integration-plan.md` の縦スライスは次の判断に立っていた:

> authoring engine は二重持ちしない。Agentra は既に PptxGenJS で PPTX を生成しているので、SDPM の **python-pptx builder 本体は取り込まず**、compose/defs Live Preview パイプラインと Deck Result Schema **だけ**を移植する。

この方針で #382（Post-generation Static Deck Preview）/ #403（Streaming Deck Preview UX）/ #417（SSE trigger + snapshot polling + AnimatedPreview）が積み上がった。これらは **完成済み PPTX を「どう見せ・どう配るか」** の層としては十分に機能している。

しかし、運用とレビューを重ねて見えてきたのは次の点である:

1. **SDPM の本質的な価値は compose/defs（表示層）ではなく、Layer 1 の Skill / Engine と Workspace-first authoring workflow にある。**
   `brief → outline → art-direction → deck.json → slides/{slug}.json → generate → measure/preview/polish` という段階的な authoring の各中間成果物（specs / slides JSON）こそが、ユーザーに「デッキが育っていく過程」を見せ、途中で軌道修正できる体験の核になる。
2. **Agentra 独自 PptxGenJS authoring をこれ以上深掘りしても、SDPM が既に持っている spec-driven な構造（1スライド=1メッセージ、layout/placeholders/elements、notes 規約）を再発明するだけ** になりつつある。slide revision orchestration の独自実装（#426 系）も同様で、SDPM の deck.json / slides JSON を正本にした方が一貫する。
3. **#382 / #417 で作った表示・配信基盤は、authoring engine が PptxGenJS でも SDPM Skill でも共通に使える。** DeckPreview / artifactManifest.deck / snapshot polling は engine 非依存に設計されている。したがって engine を差し替えても基盤を作り直す必要はない。

### 1.2 転換の要旨

> **「compose/defs だけ移植」から「SDPM Skill を Engine 候補として取り込み、Workspace を Agentra の Artifact / BFF / Frontend / Preview 基盤へ接続する」へ。**

表示・配信は既存基盤を活かす。authoring の中身（Workspace-first workflow）を SDPM Skill に寄せる。これが #442 の本線である。

---

## 2. 既存 Epic の再位置づけ / Reposition

| Epic | これまでの役割 | 今後の役割（#442 における位置づけ） |
|---|---|---|
| **#382** Post-generation Static Deck Preview | PPTX 生成完了後に `artifactManifest.deck`（`DeckResult`）から静的に `DeckPreview` を描画。S3 `decks/{deckId}/...` 永続。 | **継続・再利用。** SDPM Skill が生成した deck も同じ `DeckResult` / `DeckPreview` で表示する。engine 非依存の表示層として残す。 |
| **#403** Streaming Deck Preview UX | デッキが「できあがる過程」を逐次表示する UX 検討（Route A 決定論的リプレイ）。 | **保留・再評価。** SDPM の Workspace-first authoring（#446 / #447）が入った後、「PPTX 完成後の compose リプレイ」より「PPTX 生成前から specs/slides が育つ表示」の方が SDPM 体験に近いため、優先度と設計を再評価する。既存実装は壊さない。 |
| **#417** SSE trigger + snapshot polling + AnimatedPreview | SSE で snapshot を trigger し、BFF snapshot を polling、`changed` component をアニメーション。in-flight snapshot authorization 含む。 | **継続・再利用。** SDPM Workspace / preview の更新を Frontend へ届ける **delivery layer** として扱う。snapshot に workspace / specs / slide skeleton を載せる先（#446）。 |
| **#441** | (関連) | SDPM Skill 取り込みの前提整理。 |

**重要:** 上記いずれも **削除・破棄しない**。SDPM Skill を載せる「土台（表示・配信・artifact・authorization）」として再利用する。

---

## 3. Engine の役割整理 / `agentra-pptxgenjs` vs `sdpm-skill`

`PresentationAuthorEngine` という抽象（#445 で導入）の下に、2 つの adapter を並存させる。

| | `agentra-pptxgenjs`（現行） | `sdpm-skill`（新規・opt-in） |
|---|---|---|
| **位置づけ** | **default / fallback / legacy** | **実験的 opt-in**（`PRESENTATION_AUTHOR_ENGINE=sdpm-skill`） |
| **authoring** | LLM が PptxGenJS authoring-script を生成→実行（`packages/presentation-author/src/authoring-script.ts`） | SDPM Skill の Workspace-first workflow（brief→outline→art-direction→deck.json→slides JSON→generate） |
| **slide 表現** | JS source（PptxGenJS API 呼び出し列） | 宣言的 JSON（`deck.json` / `slides/{slug}.json`）+ `specs/*` |
| **PPTX 生成** | PptxGenJS | SDPM `pptx_builder.py generate`（python-pptx） |
| **Workspace** | 揮発 workDir のみ | 永続 `deck.json` / `specs/` / `slides/` を Agentra S3 `decks/{deckId}/...` へ同期（#446） |
| **互換性** | 既存テスト・既存外部契約を維持。default を変えない。 | additive。失敗時は warning を積んで degrade。 |

**契約:**
- `PRESENTATION_AUTHOR_ENGINE` 未設定 / `agentra-pptxgenjs` のとき、現行と完全に同一挙動（既存テストが通る）。
- `sdpm-skill` 指定時のみ SDPM 経路に入る。未実装 engine 指定時は安全に error/degrade する。
- どちらの engine でも、出力（PPTX + 任意の DeckResult）は **同一の artifact / DeckPreview pipeline** に乗る（#448）。Frontend から見て engine の差は意識しない。

---

## 4. 今後続ける作業 / Continue

既存基盤として継続し、SDPM Skill 成果物の表示・配信に再利用する:

- **DeckPreview**（Post-generation Static / AnimatedSlidePreview）— engine 非依存の表示層。
- **`artifactManifest.deck`（DeckResult schema）** — SDPM 生成 deck もこの schema に載せる。
- **snapshot polling**（`GET /threads/:threadId/decks/:deckId`）— workspace / specs / slide skeleton を載せる先。
- **in-flight snapshot authorization** — authoring 途中 snapshot の認可。SDPM Workspace preview でも同じ認可を使う。
- **S3 decks storage**（`decks/{deckId}/...`）— SDPM Workspace の `deck.json` / `specs/*` / `slides/*.json` の保存先。

---

## 5. 一旦止める / 延期する作業 / Pause or Defer

本線（#442）の進行中は、以下を **新規には深掘りしない**（既存実装は壊さず温存）:

- **Agentra 独自 PptxGenJS authoring の高度化** — `agentra-pptxgenjs` は legacy/fallback として凍結的に維持。新機能は SDPM Skill 側へ。
- **独自 slide revision orchestration の拡張**（#426 系の深掘り） — SDPM の deck.json / slides JSON を正本にした revision に寄せるため、独自路線の拡張は保留。
- **SDPM Web UI の移植** — Out of scope。Agentra Frontend に SDPM Workspace を Agentra 流に表示する（#447）。SDPM UI を丸ごと再現しない。
- **Remote MCP 構成の移植**（mcp-server / Cognito / API Gateway / DynamoDB / CDK） — Out of scope。Agentra は AgentCore runtime + Strands tools を使う。

---

## 6. 子 Issue 消化順 / Order of Operations

本 Epic は次の順で最小 PR に分割して進める。各 Issue は前段の成果に依存する。

| 順 | Issue | 種別 | 内容 | 依存 |
|---|---|---|---|---|
| 1 | **#443** | docs | 本ドキュメント（方針転換の記録） | — |
| 2 | **#444** | spike | SDPM Skill を Engine 候補として取り込めるか検証（vendor 配置 / Python 依存 / CLI 実行 / Workspace 取得 / artifact 接続点 / ライセンス） | #443 |
| 3 | **#445** | feat(backend) | `PresentationAuthorEngine` adapter 抽象を導入。既存を `agentra-pptxgenjs` adapter で包み、`sdpm-skill` は interface placeholder | #444 |
| 4 | **#446** | feat(backend) | SDPM Workspace を Agentra Deck Workspace（S3 + BFF snapshot）へ同期 | #444, #445 |
| 5 | **#448** | feat(backend+frontend) | SDPM Skill output を既存 DeckResult / DeckPreview pipeline へ接続 | #444, #445, #446 |
| 6 | **#447** | feat(frontend) | authoring 中に SDPM Workspace Preview（brief/outline/slide skeleton）を表示 | #446 |
| 7 | **#449** | test | エフェメラル環境で `sdpm-skill` engine を smoke test（最小 E2E） | #444, #445, #446, #448 |

> 注: 実装順は #448 → #447 とし、Frontend が表示する snapshot 契約（#446 / #448 で確定）に依存させる。Epic 本文の番号順（#446→#448→#447）と一致。

---

## 7. MVP 完了条件 / Definition of Done（Epic #442 再掲）

- `PRESENTATION_AUTHOR_ENGINE=sdpm-skill` の設計・実装方針が確定している。
- SDPM Skill の最小 CLI/API 呼び出しが Agentra runtime 内で成功する。
- SDPM Workspace の `deck.json` / `specs/*` / `slides/*.json` を Agentra 側で取得できる。
- SDPM 生成 PPTX を Agentra artifact pipeline へ渡せる。
- authoring 中に、少なくとも outline / slide skeleton を Agentra UI で確認できる。
- 既存 `agentra-pptxgenjs` engine が壊れていない。
- 既存 DeckPreview / artifactManifest / snapshot polling 基盤と矛盾しない。
- 実行時間・Docker 依存・vendor 更新方針・MIT-0 ライセンス表記が整理されている。

---

## 8. Out of scope（Epic #442 再掲）

- SDPM Web UI の移植
- SDPM Remote MCP / Cognito / DynamoDB / CDK 構成の移植
- component-level editing UI
- brand translation / faithful reconstruction の本実装
- Slide Master / BrandFrame v2 の本格設計
- SDPM を default engine にする判断

---

## 9. ライセンス方針 / License (MIT-0)

- SDPM は **MIT-0**（"without restriction"、帰属保持義務なし）。`THIRD-PARTY-LICENSES` は「第三者コード無し」。
- コードの取り込み・改変・再配布に帰属表示義務は **ない**。
- ただし運用上の誠実さとして、vendor 取り込みファイル先頭に `Adapted from aws-samples/sample-spec-driven-presentation-maker (MIT-0)` の 1 行コメント、およびリポジトリ `NOTICE`（または `docs/THIRD-PARTY.md`）への追記を **推奨**（義務ではない）。SPDX `MIT-0` ヘッダは保持してよい。
- 具体的な vendor 配置方針（subtree / submodule / pinned copy / upstream sync script）は #444 spike で確定する。

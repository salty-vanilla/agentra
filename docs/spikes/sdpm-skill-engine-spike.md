# Spike: SDPM Skill を Presentation Author Engine として取り込む (#444)

> **Epic:** #442 / **Depends on:** #443
> **Status:** Spike 完了（実装方針確定）
> **Source:** [aws-samples/sample-spec-driven-presentation-maker](https://github.com/aws-samples/sample-spec-driven-presentation-maker) (MIT-0), skill version `0.3.8`
> **検証日:** 2026-06-13 / **検証環境:** macOS, Python 3.11.1, uv 0.6.17

---

## 0. 結論 / TL;DR

- **SDPM Skill (`skill/`) は Agentra runtime に取り込み可能**。`skill/sdpm` パッケージは MCP / Web UI / CDK に一切依存しない自己完結パッケージ。
- **CLI/API は実環境で動作確認済み**: `init` → workspace 生成 → `generate` → **有効な PPTX (OOXML)** を **約0.2秒** で生成。`measure` / `analyze-template` も動作。`preview` のみ LibreOffice (`soffice`) を要求するが、**Agentra runtime image には既に soffice が入っている**。
- **追加 Python 依存はわずか3つ**（`qrcode` / `pygments` / `defusedxml`）。`python-pptx` / `lxml` / `Pillow` は **runtime image に既存**。→ image size 影響は最小。
- **vendor footprint ≈ 1.6MB**（`sdpm` 864K + `scripts` 64K + `templates` 76K + `references` 608K）。engine 実行に必須なのは `sdpm` + `scripts` + `templates`（≈1MB）。`references` は LLM 向けガイドで任意。
- **artifact 接続点は明確**: 生成 PPTX path → 既存 `s3-artifact-uploader`。preview SVG は **Agentra が既に使っている LibreOffice backend と同一**なので、SDPM preview の SVG を既存 `compose_slides.py` / DeckPreview pipeline に流せる。
- **既存 `agentra-pptxgenjs` engine と並存可能**: SDPM は別 Python パッケージ + 別 CLI。`PresentationAuthorEngine` adapter（#445）で env 選択。default 無改変。
- **MIT-0**: 帰属表示義務なし。誠実さとして vendor ファイルに 1 行 attribution + `docs/THIRD-PARTY.md` 追記を推奨。

---

## 1. 検証手順と実測 / What was run

```bash
# 1. 依存インストール（uv venv, 実測）
uv venv .venv                                  # 0.27s
uv pip install python-pptx lxml Pillow qrcode pygments defusedxml   # 1.66s, venv 40MB

# 2. workspace 初期化
python scripts/pptx_builder.py init demo -o /tmp/sdpm-ws
#   → deck.json, specs/brief.md, specs/outline.md, slides/  を生成

# 3. 最小2枚デッキ（日本語）を組んで generate（実測）
python scripts/pptx_builder.py generate /tmp/sdpm-ws -o /tmp/sdpm-ws/deck.pptx   # 0.22s
#   → /tmp/sdpm-ws/deck.pptx (34KB, "Microsoft OOXML" 検証済)

# 4. measure / analyze-template（LibreOffice 不要）
python scripts/pptx_builder.py measure /tmp/sdpm-ws            # text bbox 計測 OK
python scripts/pptx_builder.py analyze-template templates/blank-dark.pptx   # fonts/colors/layouts OK
```

| CLI | 結果 | LibreOffice 要否 | 備考 |
|---|---|---|---|
| `init` | ✅ 成功 | 不要 | deck.json + specs/ + slides/ を生成 |
| `generate` | ✅ 成功 (0.2s) | 不要 | 有効な PPTX。layout bias warning は情報のみ |
| `measure` | ✅ 成功 | 不要 | text bounding box 計測 |
| `analyze-template` | ✅ 成功 | 不要 | template の fonts/colors/layouts 抽出 |
| `preview` | 未実行（要 soffice） | **必要** | `LibreOfficeBackend.export_svg` → soffice。runtime image に既存 |

---

## 2. SDPM Workspace の構造（取得可能）

`init` および `generate` 入力に使う workspace ディレクトリ構造（実測）:

```
/tmp/sdpm-ws/
├── deck.json              # {template, fonts:{fullwidth,halfwidth}, defaultTextColor}
├── slides/
│   ├── intro.json         # {layout, notes, elements:[{type:"textbox",...}]}
│   └── summary.json
└── specs/
    ├── brief.md
    └── outline.md         # "- [slug] message"  → slide 順序 + 1スライド1メッセージ
```

- **slide 順序は `specs/outline.md` の `- [slug] message` 行で決まる**（`parse_outline_slugs`）。slug = `slides/{slug}.json` のファイル名。
- `deck.json` は **メタのみ**（slides を入れない）。`generate` はディレクトリを渡すと outline 順に slides を assemble する。
- → **#446 の Workspace bridge は、この `deck.json` / `specs/*` / `slides/*.json` をそのまま読んで Agentra 形式へ正規化できる**。outline の slug/message から slide skeleton（slug/index/title/message/status）を抽出可能。

---

## 3. Python 依存と Docker image 影響

| 依存 | SDPM skill | Agentra runtime image (現状) | 追加要否 |
|---|---|---|---|
| python-pptx | 必要 | ✅ あり (`>=0.6.21`) | — |
| lxml | 必要 | ✅ あり (`>=5.0.0`) | — |
| Pillow | 必要 | ✅ あり (`>=10.0.0`) | — |
| **qrcode** | 必要 | ❌ なし | **追加**（pure-python, 軽量） |
| **pygments** | 必要 (`>=2.19.2`) | ❌ なし | **追加**（code-block 構文強調用） |
| **defusedxml** | 必要 | ❌ なし | **追加**（XML 安全パース、軽量） |
| LibreOffice (`soffice`) | preview のみ | ✅ あり | — |
| poppler-utils / fonts-noto-cjk | — | ✅ あり | — |

→ `packages/presentation-author/python/requirements.txt` に **3 行追加するだけ**で SDPM skill が動く。image への増分は数 MB 未満（いずれも pure-python）。

---

## 4. vendor 配置方針 / Recommendation

検討した選択肢:

| 方式 | 長所 | 短所 | 評価 |
|---|---|---|---|
| git submodule | upstream 追跡が明示的 | CI/Docker build で submodule init が必要、monorepo 運用と相性が悪い | ✗ |
| git subtree | 履歴保持、`subtree pull` で更新 | 履歴肥大、コンフリクト解決が重い | △ |
| **pinned copy + sync script** | **build が単純（ただのファイル）、必要部分だけ取り込める、改変が容易** | upstream 更新は手動 script 実行 | **✓ 推奨** |

**推奨: pinned copy + upstream sync script。**

- 取り込み先: `packages/presentation-author/vendor/sdpm-skill/`（既存 `vendor/openai-slides/` と同じ慣習）。
- 取り込む範囲: `skill/sdpm/`（必須）+ `skill/scripts/pptx_builder.py`（CLI 入口）+ `skill/templates/`（blank-dark/light）。`skill/references/` は LLM プロンプト用に**任意**で取り込む（608K）。
- pin: upstream commit SHA と skill `__version__`（現 `0.3.8`）を `vendor/sdpm-skill/VENDOR.md` に記録。
- sync script: `scripts/vendor/sync-sdpm-skill.sh`（shallow clone → 必要 path を rsync → SHA 記録）。`vendor/openai-slides/VENDOR.md` と同様の運用。

> 注: `skill/sdpm` は `skill/scripts/pptx_builder.py` が `sys.path` に親を足して import する。CLI から呼ぶなら scripts と sdpm の相対関係を保つこと。Agentra 側からは **subprocess で `pptx_builder.py` を呼ぶ**（既存 `python-runner.ts` と同じ流儀）か、`sdpm.api` を直接 import する薄い wrapper script を置く。

---

## 5. Artifact pipeline 接続点 / Integration points

| SDPM 出力 | Agentra 既存基盤 | 接続方法 |
|---|---|---|
| 生成 PPTX path | `s3-artifact-uploader`（`runs/{runId}/...`, presigned, ArtifactRef） | adapter result の `pptxPath` を既存 upload に渡す（engine 非依存） |
| workspace `deck.json`/`specs/*`/`slides/*.json` | S3 `decks/{deckId}/...` + BFF snapshot | #446 Workspace bridge で正規化・保存 |
| preview SVG（`LibreOfficeBackend.export_svg`） | 既存 `export_svg.py` / `compose_slides.py` → DeckPreview | **同一 LibreOffice backend**。SDPM SVG をそのまま既存 compose に渡せる。無ければ PPTX→SVG fallback（既存経路）|
| measure / warnings | 既存 `PresentationAuthorResult.warnings` / diagnostics | adapter result の `warnings[]` に統合 |

**既存 engine 出力契約**（`PresentationAuthorResult`）: `{workDir, sourceJsPath, pptxPath, warnings, execution, diagnostics?, ...}`。
**#445 adapter 案**: `{pptxPath, sourcePath?, workspaceDir?, deckJsonPath?, slideJsonPaths?, warnings[]}` — 既存と整合的。`agentra-pptxgenjs` adapter は `workDir→workspaceDir`、`sourceJsPath→sourcePath`、`sdpm-skill` adapter は `workspaceDir/deckJsonPath/slideJsonPaths` を埋める。

---

## 6. PR 分割案 / Implementation plan（#445 以降）

| # | Issue | 内容 | 副作用 |
|---|---|---|---|
| #445 | feat: `PresentationAuthorEngine` adapter | engine 抽象 + `agentra-pptxgenjs` adapter で既存を包む + `PRESENTATION_AUTHOR_ENGINE` env + `sdpm-skill` placeholder | default 無改変 |
| (#445 同梱 or 別 PR) | vendor: `sdpm-skill` 取り込み | `vendor/sdpm-skill/` pinned copy + sync script + requirements に3行追加 + THIRD-PARTY 追記 | 新規ファイルのみ |
| #446 | feat: Workspace bridge | `deck.json`/`specs/*`/`slides/*.json` 読取・正規化 → S3 + BFF snapshot | additive |
| #448 | feat: DeckResult 接続 | SDPM PPTX/SVG → 既存 artifactManifest.deck / DeckPreview | additive |
| #447 | feat(frontend): Workspace Preview | brief/outline/slide skeleton 表示 | additive UI |
| #449 | test: エフェメラル smoke | `PRESENTATION_AUTHOR_ENGINE=sdpm-skill` で最小 E2E | flag 裏 |

---

## 7. ライセンス / MIT-0

- LICENSE = **MIT-0**（"without restriction"、帰属保持義務なし）。`NOTICE` = "Spec-Driven Presentation Maker, Copyright Amazon.com"。`THIRD-PARTY-LICENSES` = 第三者コード無し。
- **義務なし**だが運用上の誠実さとして:
  - vendor 取り込みファイルまたは `vendor/sdpm-skill/VENDOR.md` 先頭に `Adapted from aws-samples/sample-spec-driven-presentation-maker (MIT-0), commit <SHA>` を記載。
  - リポジトリ `docs/THIRD-PARTY.md`（or `NOTICE`）に SDPM (MIT-0) を追記。

---

## 8. リスク / 未確定事項 / Follow-up

- **fonts**: 日本語 fullwidth font は `deck.json.fonts.fullwidth` 指定。runtime image の `fonts-noto-cjk` で代替できるか、preview SVG での字形を #449 エフェメラルで確認する。
- **assets/icons**: SDPM の AWS/Material icon は download script で取得（`assets/` は空）。icon を使う slide を生成する場合は asset 取得が必要。MVP の最小 deck では不要。
- **preview SVG 構造互換**: SDPM の LibreOffice SVG が Agentra の既存 `compose_slides.py` の前提（`g[@class='Slide']` 等）と一致するかは #448 で fixture 検証する。同一 backend なので高確率で成立するが、要確認。
- **references の取り込み範囲**: LLM プロンプト品質に効くが 608K。#445 で必須最小（sdpm+scripts+templates）に絞り、references は段階導入を検討。

---

## 付録: 検証で生成した最小 deck

`specs/outline.md`:
```markdown
- [intro] このデッキの目的を伝える
- [summary] 次のアクションを促す
```
`slides/intro.json`（抜粋）:
```json
{"layout": "Blank", "notes": "イントロのスライドです。",
 "elements": [{"type": "textbox", "x": 100, "y": 200, "width": 1720, "height": 200, "fontSize": 54, "text": "SDPM Skill Spike"}]}
```
→ `generate` で 34KB の有効 PPTX を 0.2 秒で生成。

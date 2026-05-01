# Spec Driven Presentation Runtime 設計・仕様書

## 0. このドキュメントの目的

本ドキュメントは、LLM / Agent から操作可能なプレゼンテーション生成基盤 **Spec Driven Presentation Runtime** の設計・仕様を定義する。

このプロジェクトは、単なる PPTX 生成器ではなく、以下を実現するための **LLM-native Presentation Engine** として設計する。

* ユーザー要求からプレゼンテーション仕様を設計する
* スライド構成・本文・画像・図表・テーマを構造化して扱う
* LLM / Agent が操作API経由でプレゼン状態を更新できる
* 生成結果を inspect / validate / auto-fix できる
* PPTX / HTML / PDF / JSON / 将来的には Google Slides などへ export できる
* Codex / Claude Code / 自作 ChatGPT風アプリ / AgentCore Runtime から呼び出せる

---

## 1. コンセプト

### 1.1 一言でいうと

* **Presentation as Code**
* **LLM-native Slide Runtime**
* **Spec Driven Document Generation**
* **LLM が操作できるプレゼンテーションOS**

### 1.2 やらないこと

このプロジェクトは以下を主目的にしない。

* PPTX OOXML を低レイヤから完全自作する
* PowerPoint の全機能を完全再現する
* WYSIWYG エディタを最初から作る
* アニメーション、SmartArt、複雑なマスター機能を初期実装する
* 単なる `JSON -> pptxgenjs` の薄い変換器で終わる

### 1.3 価値の中心

価値の中心は exporter ではなく、以下にある。

* Presentation Spec
* Presentation IR
* Operation API
* Inspect API
* Validation / Auto-fix
* Asset Plan / Asset Registry
* Agent Tool 化しやすい設計

---

## 2. 全体アーキテクチャ

```text
User Request
  ↓
Presentation Brief
  ↓
Deck Plan
  ↓
Slide Specs
  ↓
Asset Plan
  ↓
Presentation IR
  ↓
Layout Resolution
  ↓
Validation / Auto-fix
  ↓
Export
  ├─ PPTX
  ├─ HTML
  ├─ PDF
  ├─ JSON
  └─ Google Slides  ※将来
```

---

## 3. 優先方針

### 3.1 優先度の高い公開面

REST API は初期優先度を下げる。

初期は以下を優先する。

1. `presentation-core`
2. `packages/tools`
3. CLI
4. MCP Server
5. Runner / optional external adapters

### 3.2 REST API の扱い

REST API は後続対応とする。

理由:

* ChatGPT風アプリでは、最終的にアプリ内 Agent がこの runtime / tool / agent を呼ぶ想定
* Codex / Claude Code 連携では REST より CLI / MCP が自然
* まずは core と tool contract を固めるべき
* API server は core の adapter として後から追加可能

### 3.3 中心設計

```text
presentation-core
  ↑
packages/tools
  ↑
adapters
  ├─ cli
  ├─ mcp-server
  ├─ agentcore-consumer-reference
  └─ api-server  ※後回し
```

---

## 4. 推奨開発言語

### 4.1 初期実装

* TypeScript first

理由:

* Agent tool / MCP / CLI / Hono / Web preview と相性がよい
* Zod / JSON Schema と相性がよい
* PptxGenJS を使いやすい
* 自作 ChatGPT風アプリの技術スタックと揃いやすい
* HTML / PDF export も同じ言語で扱いやすい

### 4.2 PPTX exporter

初期は以下を採用する。

* `pptxgenjs`

理由:

* TypeScript / JavaScript から扱いやすい
* テキスト、図形、画像、表、チャートなどを実装しやすい
* 初期開発速度が高い
* HTML / PDF / MCP / CLI と同一エコシステムで統合できる

### 4.3 Rust の位置づけ

Rust は初期から中心にしない。

ただし、将来的に以下の用途で導入する余地を残す。

* 高速 PPTX exporter
* PPTX validator
* 大量生成
* 単体バイナリ CLI
* OOXML 低レイヤ制御

将来構成例:

```text
PresentationIR JSON
  ↓
pptx-rs-exporter binary
  ↓
deck.pptx
```

---

## 5. モノレポ構成

### 5.1 初期推奨構成

```text
presentation-runtime/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  biome.json or eslint.config.js
  README.md

  docs/
    architecture.md
    ir.md
    operations.md
    validators.md
    exporters.md

  schemas/
    presentation-brief.schema.json
    deck-plan.schema.json
    slide-spec.schema.json
    presentation-ir.schema.json
    asset-spec.schema.json

  examples/
    manufacturing-ai-poc/
      brief.md
      brief.json
      deck-plan.json
      presentation.json
      exports/

  packages/
    core/
    tools/
    cli/
    mcp-server/
    runner/
    api-server/           # 後回し。初期は空でもよい
```

### 5.2 初期に実装する package

```text
packages/
  core/
  tools/
  cli/
  mcp-server/
  runner/
  adapters/
```

### 5.3 後続で追加・強化する package

```text
packages/
  agentcore-consumer-reference/
  runner/
  adapters/
  api-server/
  exporter-pptx-rs/
```

---

## 6. packages/core

### 6.1 役割

`packages/core` はこのプロジェクトの中心である。

責務:

* Presentation Spec の型
* Presentation IR の型
* Operation 適用
* Inspect
* Layout resolution
* Validation
* Auto-fix
* Asset Registry
* Exporter interface
* Runtime interface

外部公開プロトコルには依存しない。

MCP、REST、AgentCore、CLI の概念を core に持ち込まない。

### 6.2 ディレクトリ

```text
packages/core/src/
  index.ts

  spec/
    PresentationBrief.ts
    DeckPlan.ts
    SlideSpec.ts
    AssetSpec.ts
    ThemeSpec.ts

  ir/
    PresentationIR.ts
    SlideIR.ts
    ElementIR.ts
    RichText.ts
    AssetRegistry.ts
    OperationLog.ts

  operations/
    PresentationOperation.ts
    applyOperations.ts
    handlers/
      addSlide.ts
      removeSlide.ts
      moveSlide.ts
      addText.ts
      updateText.ts
      addImage.ts
      addTable.ts
      addChart.ts
      addDiagram.ts
      updateElement.ts

  runtime/
    PresentationRuntime.ts
    LocalPresentationRuntime.ts
    RuntimeContext.ts

  layout/
    LayoutSpec.ts
    ResolvedLayout.ts
    LayoutResolver.ts
    templates/
      title.ts
      twoColumn.ts
      comparison.ts
      dashboard.ts
      timeline.ts
      hero.ts

  validation/
    ValidationRule.ts
    ValidationIssue.ts
    ValidationReport.ts
    validatePresentation.ts
    rules/
      structural.ts
      layout.ts
      style.ts
      content.ts
      asset.ts
      export.ts
    autofix/
      autoFixPresentation.ts

  assets/
    Asset.ts
    AssetRegistry.ts
    ImageGenerator.ts
    generators/
      NoopImageGenerator.ts

  exporters/
    Exporter.ts
    ExportResult.ts
    json/
      JsonExporter.ts
    pptx/
      PptxExporter.ts
    html/
      HtmlExporter.ts

  inspect/
    InspectQuery.ts
    InspectResult.ts
    inspectPresentation.ts
    resolveAnchor.ts

  theme/
    ThemeSpec.ts
    defaultTheme.ts
    tokens.ts

  errors/
    PresentationError.ts
```

---

## 7. packages/tools

### 7.1 役割

`packages/tools` は、Agent や adapter が使う **tool definition / handler の本体**である。

これは MCP 専用ではない。

```text
packages/tools
  = protocol independent tool definitions
```

### 7.2 使われ方

```text
内部 Strands Agent
  ↓
packages/tools
  ↓
presentation-core
```

```text
MCP Server
  ↓
packages/tools
  ↓
presentation-core
```

```text
AgentCore Runtime
  ↓
packages/tools
  ↓
presentation-core
```

### 7.3 ディレクトリ

```text
packages/tools/src/
  index.ts

  definitions/
    createPresentationSpec.ts
    generateDeckPlan.ts
    generateSlideSpecs.ts
    generateAssetPlan.ts
    applyPresentationOperations.ts
    inspectPresentation.ts
    validatePresentation.ts
    exportPresentation.ts
    generateImage.ts

  handlers/
    createPresentationSpecHandler.ts
    generateDeckPlanHandler.ts
    generateSlideSpecsHandler.ts
    generateAssetPlanHandler.ts
    applyPresentationOperationsHandler.ts
    inspectPresentationHandler.ts
    validatePresentationHandler.ts
    exportPresentationHandler.ts
    generateImageHandler.ts

  schemas/
    toolSchemas.ts

  adapters/
    toMcpTool.ts
    toStrandsTool.ts
    toOpenApiOperation.ts
```

### 7.4 Tool 一覧

初期に公開する tool は絞る。

* `presentation_create_spec`
* `presentation_generate_deck_plan`
* `presentation_generate_slide_specs`
* `presentation_generate_asset_plan`
* `presentation_apply_operations`
* `presentation_inspect`
* `presentation_validate`
* `presentation_export`
* `presentation_generate_image`

低レベル操作を大量に直接公開しない。

低レベル操作は `presentation_apply_operations` の payload 内で扱う。

---

## 8. packages/cli

### 8.1 役割

Codex / Claude Code / ローカル開発者が使いやすい入口。

### 8.2 コマンド

```bash
presentation init
presentation plan ./brief.md --out ./deck-plan.json
presentation build ./deck-plan.json --out ./presentation.json
presentation inspect ./presentation.json
presentation validate ./presentation.json
presentation export ./presentation.json --format pptx --out ./deck.pptx
presentation export ./presentation.json --format html --out ./preview.html
```

### 8.3 ディレクトリ

```text
packages/cli/src/
  index.ts
  commands/
    init.ts
    plan.ts
    build.ts
    inspect.ts
    validate.ts
    export.ts
```

---

## 9. packages/mcp-server

### 9.1 役割

他Agentに tool として公開する外部公開面。

主な利用者:

* Codex
* Claude Code
* Claude Desktop
* その他 MCP client

### 9.2 構成

```text
packages/mcp-server/src/
  index.ts
  server.ts
  registerTools.ts
```

### 9.3 公開する MCP tools

`packages/tools` の definitions / handlers を MCP tool へ adapter 変換して登録する。

```text
presentation_create_spec
presentation_generate_deck_plan
presentation_generate_slide_specs
presentation_generate_asset_plan
presentation_apply_operations
presentation_inspect
presentation_validate
presentation_export
presentation_generate_image
```

### 9.4 重要方針

MCP server にはビジネスロジックを置かない。

```text
MCP server = adapter
packages/tools = tool本体
packages/core = domain/runtime
```

---

## 10. Agent integration (consumer-side)

### 10.1 役割

将来的に AWS Bedrock AgentCore Runtime 上で Presentation Agent として公開するための package。

### 10.2 位置づけ

これは tool 公開ではなく、**Agent公開**である。

```text
他Agent / ChatGPT風アプリ
  ↓
Presentation Agent Runtime
  ↓
packages/tools
  ↓
presentation-core
```

### 10.3 実装場所

consumer-side の Agent runtime 実装はこのモノレポ外（利用側リポジトリ）で管理する。

### 10.4 公開する能力

Presentation Agent は以下を一括で実行できる。

* brief 作成
* deck plan 作成
* slide spec 作成
* asset plan 作成
* 画像生成
* IR build
* validation
* auto-fix
* export

### 10.5 Tool公開との違い

Tool公開:

```text
この操作を実行して
```

Agent公開:

```text
この目的のプレゼンを作って
```

### 10.6 初期実装優先度

* v1では後回しでもよい
* ただし `packages/tools` を protocol independent にしておくことで、後から追加しやすくする

---

## 11. packages/runner

### 11.1 役割

`packages/runner` は deck-forge の中核実行器である。

責務:

* `DeckForgeRunner`
* create / modify workflow
* validation
* auto-fix
* bounded revision loop
* export
* trace / error / revision summary

Runner は AgentCore / Strands / AWS / Bedrock / MCP を知らない。
外部連携は adapter 側で扱う。

### 11.2 構成

```text
packages/runner/src/
  runner.ts
  index.ts
```

### 11.3 Revision policy

`validation_only`:

```text
validate -> autoFixPresentation -> revalidate
```

`ai_review`:

```text
validate -> review -> plan -> apply_operations -> revalidate
```

`ai_review` では validation report を reviewer に渡す。
AI review は validation 結果を踏まえて `ReviewIssue[]` を返し、operation planner が `PresentationOperation[]` に変換する。
修正適用は必ず `applyPresentationOperationsHandler` 経由にする。

### 11.4 packages/adapters

`packages/adapters` は optional integration package である。

責務:

* Strands tool adapter
* 将来の AgentCore deployment adapter
* 将来の AWS / S3 artifact publisher
* 将来の Bedrock reviewer / operation planner adapter
* 将来の MCP adapter 共通化

Import policy:

* `@deck-forge/adapters/strands` を Strands adapter の主要 import path にする
* `@deck-forge/adapters` root から Strands 固有実装は export しない
* root export は空、または将来的な adapter 共通型のみに限定する

Strands は Planner Agent 側、または reviewer / operation planner adapter の実装詳細として使う。
AgentCore は deployment adapter の1つであり、runner 本体ではない。

`setPresentationReviewer` / `setPresentationOperationPlanner` は MCP / standalone tools 向け fallback API として残す。
Runner 用途では非推奨であり、Runner は input adapter を handler に渡す。

---

## 12. packages/api-server

### 12.1 優先度

REST API は一段優先度を下げる。

### 12.2 将来の役割

自作 ChatGPT風アプリや他サービスから HTTP 経由で呼ぶ場合の adapter。

### 12.3 将来構成

```text
packages/api-server/src/
  app.ts
  routes/
    presentations.ts
    assets.ts
    exports.ts
  services/
    PresentationService.ts
  storage/
    PresentationRepository.ts
    ArtifactStore.ts
```

### 12.4 方針

* API server に domain logic を置かない
* API server は `packages/tools` または `packages/core` を呼ぶだけ
* Hono 採用を想定
* 初期は実装しなくてよい

---

## 13. Core Data Model

## 13.1 PresentationBrief

```ts
export type PresentationBrief = {
  id: string
  title: string
  audience: AudienceSpec
  goal: GoalSpec
  context?: string
  tone: ToneSpec
  narrative: NarrativeSpec
  output: OutputSpec
  constraints: PresentationConstraints
  visualDirection: VisualDirectionSpec
  brand?: BrandSpec
}
```

### AudienceSpec

```ts
export type AudienceSpec = {
  primary: string
  secondary?: string[]
  expertiseLevel: "beginner" | "intermediate" | "expert" | "executive"
  expectedConcern?: string[]
  expectedQuestions?: string[]
}
```

### GoalSpec

```ts
export type GoalSpec = {
  type:
    | "inform"
    | "persuade"
    | "proposal"
    | "report"
    | "training"
    | "sales"
    | "research"
    | "decision_support"
  mainMessage: string
  desiredOutcome: string
  successCriteria?: string[]
}
```

### ToneSpec

```ts
export type ToneSpec = {
  formality: "casual" | "business" | "executive" | "academic"
  energy: "calm" | "confident" | "bold" | "inspiring"
  technicalDepth: "low" | "medium" | "high"
  styleKeywords?: string[]
}
```

### NarrativeSpec

```ts
export type NarrativeSpec = {
  structure:
    | "problem_solution"
    | "before_after"
    | "proposal"
    | "analysis"
    | "story"
    | "pyramid"
    | "research_paper"
    | "demo"
  arc: NarrativeStep[]
}

export type NarrativeStep = {
  role:
    | "hook"
    | "problem"
    | "insight"
    | "solution"
    | "evidence"
    | "implementation"
    | "impact"
    | "call_to_action"
  message: string
}
```

---

## 13.2 DeckPlan

```ts
export type DeckPlan = {
  id: string
  briefId: string
  title: string
  slideCountTarget: number
  sections: DeckSection[]
  globalStoryline: string
}
```

```ts
export type DeckSection = {
  id: string
  title: string
  role:
    | "intro"
    | "background"
    | "problem"
    | "proposal"
    | "analysis"
    | "solution"
    | "implementation"
    | "result"
    | "appendix"
  slides: SlidePlan[]
}
```

```ts
export type SlidePlan = {
  id: string
  title: string
  intent: SlideIntent
  expectedLayout: LayoutIntent
  contentRequirements: ContentRequirement[]
  assetRequirements?: AssetRequirement[]
}
```

---

## 13.3 SlideIntent

```ts
export type SlideIntent = {
  type:
    | "title"
    | "agenda"
    | "summary"
    | "problem"
    | "comparison"
    | "timeline"
    | "process"
    | "architecture"
    | "data_insight"
    | "case_study"
    | "proposal"
    | "decision"
    | "closing"
  keyMessage: string
  audienceTakeaway: string
}
```

重要:

* 各スライドは必ず `intent` を持つ
* スライドは単なる要素集合ではなく、伝えるべきメッセージを持つ
* validator は `intent` と content の整合性も見る

---

## 13.4 SlideSpec

```ts
export type SlideSpec = {
  id: string
  slideNumber?: number
  title: string
  intent: SlideIntent
  layout: LayoutSpec
  content: ContentBlock[]
  speakerNotes?: SpeakerNotesSpec
  assets?: AssetSpecRef[]
  constraints?: SlideConstraints
}
```

---

## 13.5 ContentBlock

```ts
export type ContentBlock =
  | TitleBlock
  | SubtitleBlock
  | ParagraphBlock
  | BulletListBlock
  | TableBlock
  | ChartBlock
  | ImageBlock
  | DiagramBlock
  | MetricBlock
  | CalloutBlock
  | CodeBlock
  | QuoteBlock
```

### TitleBlock

```ts
export type TitleBlock = {
  id: string
  type: "title"
  text: string
  emphasis?: "normal" | "strong" | "subtle"
}
```

### BulletListBlock

```ts
export type BulletListBlock = {
  id: string
  type: "bullet_list"
  items: BulletItem[]
  hierarchy?: "flat" | "nested"
  density?: "low" | "medium" | "high"
}

export type BulletItem = {
  text: string
  children?: BulletItem[]
  importance?: "low" | "medium" | "high"
}
```

### TableBlock

```ts
export type TableBlock = {
  id: string
  type: "table"
  caption?: string
  headers: string[]
  rows: string[][]
  emphasis?: {
    rows?: number[]
    columns?: number[]
    cells?: { row: number; column: number }[]
  }
}
```

### ChartBlock

```ts
export type ChartBlock = {
  id: string
  type: "chart"
  chartType: "bar" | "line" | "area" | "pie" | "scatter" | "combo"
  title?: string
  data: ChartData
  encoding: ChartEncoding
  insight?: string
}
```

### DiagramBlock

```ts
export type DiagramBlock = {
  id: string
  type: "diagram"
  diagramType:
    | "flowchart"
    | "architecture"
    | "timeline"
    | "layered"
    | "cycle"
    | "matrix"
    | "funnel"
    | "system_map"
  nodes: DiagramNode[]
  edges?: DiagramEdge[]
}
```

---

## 13.6 LayoutSpec

```ts
export type LayoutSpec = {
  type:
    | "title"
    | "section"
    | "single_column"
    | "two_column"
    | "three_column"
    | "hero"
    | "image_left_text_right"
    | "text_left_image_right"
    | "comparison"
    | "dashboard"
    | "timeline"
    | "matrix"
    | "diagram_focus"
    | "custom"
  density: "low" | "medium" | "high"
  emphasis?: "top" | "left" | "right" | "center" | "visual" | "data"
  regions?: LayoutRegion[]
}
```

```ts
export type LayoutRegion = {
  id: string
  role:
    | "title"
    | "body"
    | "visual"
    | "sidebar"
    | "footer"
    | "chart"
    | "table"
    | "callout"
  contentRefs: string[]
  priority: number
}
```

方針:

* LLM に座標を直接書かせない
* LLM には `layout.type` や `density` を指定させる
* 座標は LayoutResolver が計算する

---

## 13.7 ThemeSpec

```ts
export type ThemeSpec = {
  id: string
  name: string
  colors: ColorTokens
  typography: TypographyTokens
  spacing: SpacingTokens
  radius: RadiusTokens
  shadows?: ShadowTokens
  slideDefaults: SlideStyleDefaults
  elementDefaults: ElementStyleDefaults
}
```

```ts
export type ColorTokens = {
  background: string
  surface: string
  textPrimary: string
  textSecondary: string
  primary: string
  secondary: string
  accent: string
  success?: string
  warning?: string
  danger?: string
  chartPalette: string[]
}
```

```ts
export type TypographyTokens = {
  fontFamily: {
    heading: string
    body: string
    mono?: string
  }
  fontSize: {
    title: number
    heading: number
    body: number
    caption: number
    footnote: number
  }
  lineHeight: {
    tight: number
    normal: number
    relaxed: number
  }
  weight: {
    regular: number
    medium: number
    bold: number
  }
}
```

---

## 13.8 AssetSpec

```ts
export type AssetSpec =
  | GeneratedImageAssetSpec
  | DiagramAssetSpec
  | IconAssetSpec
  | ExternalImageAssetSpec
  | RetrievedImageAssetSpec
  | ScreenshotAssetSpec
```

### GeneratedImageAssetSpec

```ts
export type GeneratedImageAssetSpec = {
  id: string
  type: "generated_image"
  purpose:
    | "hero"
    | "background"
    | "concept"
    | "illustration"
    | "thumbnail"
    | "supporting_visual"
  visualDirection: VisualDirectionSpec
  prompt: string
  negativePrompt?: string
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:2"
  resolution?: {
    width: number
    height: number
  }
  targetSlideIds?: string[]
}
```

### VisualDirectionSpec

```ts
export type VisualDirectionSpec = {
  style:
    | "minimal"
    | "corporate"
    | "technical"
    | "industrial"
    | "isometric"
    | "flat_vector"
    | "photorealistic"
    | "abstract"
    | "diagrammatic"
  mood:
    | "calm"
    | "trustworthy"
    | "futuristic"
    | "energetic"
    | "premium"
    | "practical"
  colorMood?: string
  composition?: string
  avoid?: string[]
}
```

### RetrievedImageAssetSpec

```ts
export type RetrievedImageAssetSpec = {
  id: string
  type: "retrieved_image"
  provider:
    | "unsplash"
    | "pexels"
    | "pixabay"
    | "flaticon"
    | "noun_project"
    | "icons8"
    | "undraw"
    | "storyset"
    | "shigureni"
    | "irasutoya"
    | "other"
  query: string
  selected?: ImageSearchCandidate
  licenseConstraints?: string[]
  targetSlideIds?: string[]
}
```

### External Asset Metadata（ライセンス追跡）

外部取得アセットは以下の metadata を保持する。

* provider
* author
* license
* sourcePageUrl
* attributionRequired
* attributionText

初期方針:

* 写真系 provider（Unsplash / Pexels / Pixabay）を優先対応
* イラスト / アイコン系 provider は段階的に追加
* ライセンス情報が欠損している外部アセットは validation で検出する

---

## 14. PresentationIR

```ts
export type PresentationIR = {
  id: string
  version: string
  meta: PresentationMeta
  brief?: PresentationBrief
  deckPlan?: DeckPlan
  theme: ThemeSpec
  slides: SlideIR[]
  assets: AssetRegistry
  operationLog: OperationRecord[]
  validation?: ValidationReport
}
```

### SlideIR

```ts
export type SlideIR = {
  id: string
  index: number
  specId?: string
  title?: string
  intent?: SlideIntent
  layout: ResolvedLayout
  elements: ElementIR[]
  speakerNotes?: string
  comments?: CommentThread[]
  metadata?: Record<string, unknown>
}
```

### ElementIR

```ts
export type ElementIR =
  | TextElementIR
  | ShapeElementIR
  | ImageElementIR
  | TableElementIR
  | ChartElementIR
  | DiagramElementIR
```

### TextElementIR

```ts
export type TextElementIR = {
  id: string
  type: "text"
  role: "title" | "subtitle" | "body" | "caption" | "callout" | "footer"
  text: RichText
  frame: ResolvedFrame
  style: TextStyle
}
```

### RichText

```ts
export type RichText = {
  paragraphs: RichParagraph[]
}

export type RichParagraph = {
  runs: RichTextRun[]
  alignment?: "left" | "center" | "right"
  spacingBefore?: number
  spacingAfter?: number
}

export type RichTextRun = {
  text: string
  style?: TextStyle
  link?: {
    url: string
  }
}
```

---

## 15. Operation API

### 15.1 Operation Union

```ts
export type PresentationOperation =
  | CreatePresentationOperation
  | AddSlideOperation
  | RemoveSlideOperation
  | MoveSlideOperation
  | SetSlideLayoutOperation
  | AddTextOperation
  | UpdateTextOperation
  | FormatTextRangeOperation
  | AddImageOperation
  | ReplaceImageOperation
  | AddTableOperation
  | UpdateTableCellOperation
  | StyleTableBlockOperation
  | AddChartOperation
  | UpdateChartOperation
  | AddDiagramOperation
  | UpdateDiagramOperation
  | AttachAssetOperation
  | ApplyThemeOperation
```

### 15.2 代表例

```ts
export type AddSlideOperation = {
  type: "add_slide"
  slideId?: string
  index?: number
  title?: string
  intent?: SlideIntent
  layout: LayoutSpec
}
```

```ts
export type AddTextOperation = {
  type: "add_text"
  slideId: string
  elementId?: string
  role: TextElementIR["role"]
  text: string | RichText
  regionId?: string
  style?: Partial<TextStyle>
}
```

```ts
export type AddImageOperation = {
  type: "add_image"
  slideId: string
  elementId?: string
  assetId: string
  role?: "background" | "hero" | "inline" | "icon"
  regionId?: string
}
```

---

## 16. Runtime Interface

最重要の抽象化。

```ts
export interface PresentationRuntime {
  create(input: CreatePresentationInput): Promise<PresentationIR>

  applyOperations(
    presentation: PresentationIR,
    operations: PresentationOperation[]
  ): Promise<PresentationIR>

  inspect(
    presentation: PresentationIR,
    query: InspectQuery
  ): Promise<InspectResult>

  validate(
    presentation: PresentationIR,
    options?: ValidateOptions
  ): Promise<ValidationReport>

  export(
    presentation: PresentationIR,
    options: ExportOptions
  ): Promise<ExportResult>
}
```

### LocalPresentationRuntime

```ts
export class LocalPresentationRuntime implements PresentationRuntime {
  constructor(options: {
    exporters: Exporter[]
    imageGenerators?: ImageGenerator[]
    validator?: PresentationValidator
    layoutResolver?: LayoutResolver
  }) {}
}
```

### RemotePresentationRuntime

将来 API server を作る場合に追加する。

```ts
export class RemotePresentationRuntime implements PresentationRuntime {
  constructor(options: {
    baseUrl: string
    apiKey?: string
  }) {}
}
```

---

## 17. Inspect / Anchor

### 17.1 Inspect API

```ts
export type InspectQuery = {
  include?: Array<
    | "deck"
    | "slides"
    | "elements"
    | "text"
    | "layout"
    | "assets"
    | "validation"
  >
  slideId?: string
  elementId?: string
  targetId?: string
}
```

### 17.2 Anchor ID

Codex風に安定IDを使う。

```text
deck/{deckId}
slide/{slideId}
element/{elementId}
text/{elementId}/range/{rangeId}
asset/{assetId}
comment/{threadId}
```

短縮形:

```text
sl/{slideId}
el/{elementId}
tr/{rangeId}
as/{assetId}
```

### 17.3 resolveAnchor

```ts
export function resolveAnchor(
  presentation: PresentationIR,
  anchorId: string
): ResolvedAnchor
```

---

## 18. Asset System

### 18.1 AssetRegistry

```ts
export type AssetRegistry = {
  assets: Asset[]
}
```

```ts
export type Asset = {
  id: string
  specId?: string
  type: "image" | "diagram" | "icon" | "chart" | "other"
  uri: string
  mimeType: string
  metadata: {
    width?: number
    height?: number
    source: "generated" | "uploaded" | "external" | "derived"
    generator?: string
    prompt?: string
    createdAt: string
  }
  usage: AssetUsage[]
}
```

```ts
export type AssetUsage = {
  slideId: string
  elementId: string
  role: "background" | "hero" | "inline" | "icon" | "diagram"
}
```

### 18.2 ImageGenerator interface

```ts
export interface ImageGenerator {
  name: string
  generate(input: ImageGenerationRequest): Promise<GeneratedAsset>
}
```

```ts
export type ImageGenerationRequest = {
  prompt: string
  negativePrompt?: string
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:2"
  visualDirection?: VisualDirectionSpec
  outputDir?: string
}
```

---

## 19. Validation

### 19.1 ValidationReport

```ts
export type ValidationReport = {
  status: "passed" | "warning" | "failed"
  issues: ValidationIssue[]
  summary: {
    errorCount: number
    warningCount: number
    infoCount: number
  }
}
```

```ts
export type ValidationIssue = {
  id: string
  severity: "error" | "warning" | "info"
  category:
    | "structural"
    | "layout"
    | "style"
    | "content"
    | "asset"
    | "export"
  message: string
  target?: string
  autoFixable?: boolean
  suggestedFix?: AutoFixAction
}
```

### 19.2 Structural Validator

チェック項目:

* slide が0枚ではない
* slide id が一意
* element id が一意
* slide intent が存在する
* title が空ではない
* chart data が空ではない
* table rows と headers の列数が一致
* asset 参照が存在する

### 19.3 Layout Validator

チェック項目:

* 要素がスライド外にはみ出していない
* 重要要素が重なっていない
* タイトル領域が確保されている
* body 要素の密度が高すぎない
* 画像が極端に引き伸ばされていない
* 最小余白を満たしている

### 19.4 Style Validator

チェック項目:

* フォントサイズが小さすぎない
* 色コントラストが低すぎない
* テーマトークン外の色を使いすぎていない
* 同一スライド内のスタイルがばらつきすぎていない
* chart palette がテーマと一致している

### 19.5 Content Validator

チェック項目:

* 1スライド1メッセージになっている
* タイトルが要点を示している
* 箇条書きが長すぎない
* 冗長な説明がない
* スライド間の論理がつながっている
* 対象読者に対して専門的すぎない

### 19.6 Asset Validator

チェック項目:

* 画像がスライド意図と一致している
* 背景画像として使う場合、文字を置ける余白がある
* 解像度が十分
* 画像比率が配置領域と合っている
* アイコンのスタイルが統一されている
* 不自然な生成画像になっていない

---

## 20. Auto-fix

### 20.1 AutoFixAction

```ts
export type AutoFixAction = {
  type:
    | "move_element"
    | "resize_element"
    | "reduce_font_size"
    | "split_slide"
    | "shorten_text"
    | "apply_theme_token"
    | "crop_image"
  target: string
  params: Record<string, unknown>
}
```

### 20.2 初期対応する auto-fix

* 要素の再配置
* フォントサイズ調整
* 箇条書きの圧縮
* スライド分割候補提示
* 画像トリミング
* 余白調整
* テーマ色への補正

---

## 21. Exporter

### 21.1 Exporter interface

```ts
export interface Exporter {
  format: ExportFormat
  export(
    presentation: PresentationIR,
    options: ExportOptions
  ): Promise<ExportResult>
}
```

```ts
export type ExportFormat = "pptx" | "html" | "pdf" | "json" | "google_slides"
```

```ts
export type ExportResult = {
  format: ExportFormat
  path?: string
  uri?: string
  data?: Uint8Array | string
  warnings?: string[]
}
```

### 21.2 PptxExporter

初期実装は `pptxgenjs` を使う。

責務:

* スライドサイズ設定
* テーマ適用
* テキスト描画
* 図形描画
* 画像配置
* 表描画
* 基本グラフ描画
* speaker notes
* metadata

### 21.3 HtmlExporter

用途:

* Web preview
* PDF変換の中間形式
* 差分確認
* CIでスクリーンショット検証

### 21.4 JsonExporter

用途:

* 再現性
* Git差分管理
* Codex / Claude Code による修正
* CI

### 21.5 PdfExporter

後続実装。

推奨:

```text
PresentationIR
  ↓
HTML
  ↓
Playwright
  ↓
PDF
```

---

## 22. Tool仕様

## 22.1 presentation_create_spec

入力:

```ts
export type CreatePresentationSpecInput = {
  userRequest: string
  audience?: string
  goal?: string
  slideCount?: number
  tone?: string
  outputFormat?: "pptx" | "pdf" | "html" | "json"
}
```

出力:

```ts
export type CreatePresentationSpecOutput = {
  brief: PresentationBrief
}
```

## 22.2 presentation_generate_deck_plan

入力:

```ts
export type GenerateDeckPlanInput = {
  brief: PresentationBrief
}
```

出力:

```ts
export type GenerateDeckPlanOutput = {
  deckPlan: DeckPlan
}
```

## 22.3 presentation_generate_slide_specs

入力:

```ts
export type GenerateSlideSpecsInput = {
  brief: PresentationBrief
  deckPlan: DeckPlan
}
```

出力:

```ts
export type GenerateSlideSpecsOutput = {
  slideSpecs: SlideSpec[]
}
```

## 22.4 presentation_generate_asset_plan

入力:

```ts
export type GenerateAssetPlanInput = {
  brief: PresentationBrief
  slideSpecs: SlideSpec[]
}
```

出力:

```ts
export type GenerateAssetPlanOutput = {
  assetSpecs: AssetSpec[]
}
```

## 22.5 presentation_apply_operations

入力:

```ts
export type ApplyPresentationOperationsInput = {
  presentation: PresentationIR
  operations: PresentationOperation[]
}
```

出力:

```ts
export type ApplyPresentationOperationsOutput = {
  presentation: PresentationIR
}
```

## 22.6 presentation_inspect

入力:

```ts
export type InspectPresentationInput = {
  presentation: PresentationIR
  query: InspectQuery
}
```

出力:

```ts
export type InspectPresentationOutput = {
  result: InspectResult
}
```

## 22.7 presentation_validate

入力:

```ts
export type ValidatePresentationInput = {
  presentation: PresentationIR
  level?: "basic" | "strict" | "export"
}
```

出力:

```ts
export type ValidatePresentationOutput = {
  report: ValidationReport
}
```

## 22.8 presentation_export

入力:

```ts
export type ExportPresentationInput = {
  presentation: PresentationIR
  format: "pptx" | "html" | "json" | "pdf"
  outputPath?: string
}
```

出力:

```ts
export type ExportPresentationOutput = {
  result: ExportResult
}
```

## 22.9 presentation_generate_image

入力:

```ts
export type GenerateImageInput = {
  assetSpec: GeneratedImageAssetSpec
  outputDir?: string
  provider?: "openai" | "bedrock" | "local-file"
  model?: string
  timeoutMs?: number
  retries?: number
  openaiApiKey?: string
  openaiBaseUrl?: string
  bedrockRegion?: string
  bedrockModelId?: string
}
```

出力:

```ts
export type GenerateImageOutput = {
  asset: Asset
}
```

## 22.10 presentation_search_assets

入力:

```ts
export type SearchAssetsInput = {
  query: string
  provider?: "unsplash" | "pexels" | "pixabay"
  limit?: number
}
```

出力:

```ts
export type SearchAssetsOutput = {
  candidates: ImageSearchCandidate[]
}
```

運用ルール:

* provider 指定時は当該 API key が必須
* key 未設定時は fallback せず、明示エラーを返す

## 22.11 presentation_attach_retrieved_asset

入力:

```ts
export type AttachRetrievedAssetInput = {
  presentation: PresentationIR
  assetSpec: RetrievedImageAssetSpec | ExternalImageAssetSpec
  outputDir?: string
}
```

出力:

```ts
export type AttachRetrievedAssetOutput = {
  asset: Asset
  presentation: PresentationIR
}
```

運用ルール:

* `RetrievedImageAssetSpec.provider` に対応する key が必須
* key 未設定時は取得をスキップせず明示エラーを返す

## 22.12 presentation_add_chart

入力:

```ts
export type AddChartInput = {
  presentation: PresentationIR
  operation: {
    type: "add_chart"
    slideId: string
    elementId?: string
    chartType: "bar" | "line" | "area" | "pie" | "scatter" | "combo"
    data: {
      series: { name: string; values: number[] }[]
      categories?: string[]
    }
    encoding: {
      x?: string
      y?: string
      color?: string
      size?: string
    }
    regionId?: string
  }
}
```

出力:

```ts
export type AddChartOutput = {
  presentation: PresentationIR
}
```

## 22.13 presentation_update_chart_data

入力:

```ts
export type UpdateChartDataInput = {
  presentation: PresentationIR
  operation: {
    type: "update_chart_data"
    slideId: string
    elementId: string
    data: {
      series: { name: string; values: number[] }[]
      categories?: string[]
    }
    encoding?: {
      x?: string
      y?: string
      color?: string
      size?: string
    }
    chartType?: "bar" | "line" | "area" | "pie" | "scatter" | "combo"
  }
}
```

出力:

```ts
export type UpdateChartDataOutput = {
  presentation: PresentationIR
}
```

## 22.14 presentation_component_preflight

入力:

```ts
export type ComponentPreflightInput = {
  slideSpecs: SlideSpec[]
  componentsDir?: string
}
```

出力:

```ts
export type ComponentPreflightOutput = {
  result: {
    catalog: ComponentCatalog
    matches: { slideId: string; componentId: string }[]
    missing: {
      slideId: string
      requiredCapability: string
      suggestedComponentId: string
    }[]
  }
}
```

## 22.15 presentation_component_synthesize

入力:

```ts
export type ComponentSynthesizeInput = {
  slideSpecs: SlideSpec[]
  componentsDir?: string
}
```

出力:

```ts
export type ComponentSynthesizeOutput = {
  created: ComponentSpec[]
  catalog: ComponentCatalog
}
```

## 22.16 presentation_component_list

入力:

```ts
export type ListComponentsInput = {
  componentsDir?: string
}
```

出力:

```ts
export type ListComponentsOutput = {
  catalog: ComponentCatalog
}
```

---

## 23. Workflow

### 23.1 新規作成フロー

```text
1. User Request
2. presentation_create_spec
3. presentation_generate_deck_plan
4. presentation_generate_slide_specs
5. presentation_component_preflight
6. presentation_component_synthesize (if missing exists)
7. presentation_generate_asset_plan
8. presentation_generate_image / presentation_search_assets / presentation_attach_retrieved_asset
9. build PresentationIR
10. presentation_validate
11. auto-fix if needed
12. presentation_export
```

補足:

* `presentation_generate_asset_plan` の `acquisitionMode=auto` は最小ヒューリスティック（visual style ベース）で判定する
* component catalog は `templates/components/*.json` に永続化される
* Agent runtime では `appliedPolicy`（role/design/visual preset）と `componentTrace`（missing/created件数）を返す

### 23.2 修正フロー

```text
1. User: 「3枚目を経営層向けにして」
2. presentation_inspect
3. slide spec / operations を作る
4. presentation_apply_operations
5. presentation_validate
6. presentation_export
```

### 23.3 Codex / Claude Code フロー

```text
1. Codex が brief.md を読む
2. MCP tool or CLI で plan / build / validate / export
3. presentation.json と deck.pptx をプロジェクトに出力
4. Git差分で presentation.json をレビュー
5. 必要なら Codex が JSON / operation を修正
```

---

## 24. 保存フォーマット

プロジェクト内の保存形式例:

```text
my-deck/
  brief.md
  brief.json
  deck-plan.json
  presentation.json
  slides/
    slide-001.json
    slide-002.json
  assets/
    img-001.png
    img-002.png
  exports/
    deck.pptx
    deck.html
    deck.pdf
  logs/
    operations.jsonl
    validation.json
```

---

## 25. OperationLog

```ts
export type OperationRecord = {
  id: string
  timestamp: string
  actor: "user" | "agent" | "system"
  operation: PresentationOperation
  beforeHash?: string
  afterHash?: string
  result: "success" | "failed"
  error?: string
}
```

用途:

* undo
* redo
* replay
* debug
* 差分レビュー
* Agentの挙動追跡

---

## 26. LLM Prompt 方針

### 26.1 Step 1: Brief生成

目的:

* ユーザー要求から PresentationBrief を作る

ルール:

* 出力は JSON
* 対象読者、目的、主メッセージ、トーン、制約を明確にする

### 26.2 Step 2: DeckPlan生成

目的:

* 全体構成を作る

ルール:

* 各スライドに `intent`, `keyMessage`, `audienceTakeaway` を入れる
* 1スライド1メッセージを守る

### 26.3 Step 3: SlideSpec生成

目的:

* 各スライドの詳細仕様を作る

ルール:

* LLMは座標を指定しない
* layout.type と content blocks を指定する
* 画像や図が必要なら asset requirement を出す

### 26.4 Step 4: AssetPlan生成

目的:

* 必要な画像・図表・アイコンを設計する

ルール:

* `purpose`, `visualDirection`, `prompt`, `aspectRatio` を含める
* 単に「AIっぽい画像」など曖昧なpromptにしない
* スライド意図と関連づける

---

## 27. 品質基準

### 27.1 Deck品質

* 全体ストーリーが一貫している
* スライド順序が自然
* 1枚ごとの役割が明確
* 意思決定に必要な情報が揃っている

### 27.2 Slide品質

* 1スライド1メッセージ
* タイトルだけで要点が分かる
* 本文が過密でない
* 図表が意図と一致
* 視線誘導がある

### 27.3 Visual品質

* テーマが一貫
* 余白が十分
* 色が整理されている
* 画像が安っぽくない
* アイコンのスタイルが統一

### 27.4 Export品質

* PowerPointで開ける
* レイアウト崩れが少ない
* PDF化しても読める
* 画像がぼやけない
* ファイルサイズが過大でない

---

## 28. 実装フェーズ

## Phase 1: Core + JSON + PPTX最小出力

### 実装対象

* PresentationBrief
* DeckPlan
* SlideSpec
* PresentationIR
* ThemeSpec
* AssetSpec
* JsonExporter
* PptxExporter
* LocalPresentationRuntime

### 受け入れ条件

* 手書き `presentation.json` から PPTX を生成できる
* title slide / text slide / image slide / table slide を出せる
* JSON export / import ができる

---

## Phase 2: Operation API + Inspect

### 実装対象

* PresentationOperation
* applyOperations
* addSlide
* addText
* addImage
* addTable
* inspectPresentation
* resolveAnchor
* operationLog

### 受け入れ条件

* operation list から IR を更新できる
* slide / element を inspect できる
* element id / anchor id で参照できる

---

## Phase 3: CLI

### 実装対象

* `presentation init`
* `presentation inspect`
* `presentation validate`
* `presentation export`

### 受け入れ条件

* Codex / Claude Code からCLI実行して資料生成できる
* プロジェクト配下に `presentation.json` と `deck.pptx` を生成できる

---

## Phase 4: Validation

### 実装対象

* structural validator
* layout validator basic
* style validator basic
* content validator basic
* validation report

### 受け入れ条件

* 明らかな壊れた IR を検出できる
* フォントサイズ過小、要素はみ出し、asset missing を検出できる

---

## Phase 5: MCP Server

### 実装対象

* MCP server
* packages/tools adapter
* presentation_inspect
* presentation_validate
* presentation_export
* presentation_apply_operations

### 受け入れ条件

* Codex / Claude Code から MCP tool として呼べる
* presentation.json を読み、PPTX export できる

---

## Phase 6: Spec Driven生成

### 実装対象

* createPresentationSpec
* generateDeckPlan
* generateSlideSpecs
* generateAssetPlan
* prompt templates

### 受け入れ条件

* ユーザー要求から brief / deck plan / slide specs を生成できる
* slide intent がすべてのスライドに付与される

---

## Phase 7: Asset Runtime + Image Generation

### 実装対象

* AssetRegistry
* ImageGenerator interface
* ImageRetriever interface
* Bedrock/OpenAI image generator adapter
* Unsplash/Pexels/Pixabay retriever adapter
* generated image asset
* retrieved image asset
* attach asset operation

### 受け入れ条件

* AssetSpec から画像生成できる
* 外部 provider から画像検索・取得できる
* provider / license / attribution metadata を保持できる
* 生成画像を AssetRegistry に登録できる
* スライドに画像を配置できる

---

## Phase 8: Runner / External Adapters

### 実装対象

* runner
* adapters
* `@deck-forge/adapters/strands`
* internal policy injection (`balanced` / `visual_heavy` / `data_heavy`)
* component preflight / synthesize integration

### 受け入れ条件

* Runner が spec設計、生成、検証、revision、exportまで実行できる
* Strands tool adapter は `@deck-forge/adapters/strands` から import できる
* create workflow で component preflight -> optional synthesize が実行される
* 結果に `appliedPolicy` と `componentTrace` が含まれる

---

## 29. Codex向け実装指示

Codexで実装する場合、最初の作業単位は以下がよい。

### Task 1

* monorepo skeleton を作る
* pnpm workspace
* TypeScript project references
* packages/core
* packages/cli
* packages/tools
* packages/mcp-server

### Task 2

* core の型定義を作る
* PresentationBrief
* DeckPlan
* SlideSpec
* PresentationIR
* ElementIR
* AssetSpec
* ThemeSpec

### Task 3

* JsonExporter を実装する
* import / export roundtrip test を作る

### Task 4

* PptxExporter の最小実装
* title slide
* text slide
* image slide
* table slide

### Task 5

* Operation API
* addSlide
* addText
* addImage
* addTable
* applyOperations

### Task 6

* inspectPresentation
* resolveAnchor

### Task 7

* CLI
* export command
* validate command
* inspect command

### Task 8

* validation basic

### Task 9

* MCP server

---

## 30. 非機能要件

### 30.1 再現性

* 同じ IR から同じ export 結果を得られること
* operation log を残すこと
* JSON を Git 管理しやすいこと

### 30.2 拡張性

* exporter を差し替え可能にすること
* image generator を差し替え可能にすること
* validator rule を追加可能にすること
* tool adapter を追加可能にすること

### 30.3 安全性

* ファイル読み書き範囲を制御できること
* MCP / CLI 経由で任意パスに勝手に書かないこと
* outputPath は workspace root 配下に制限可能にすること

### 30.4 デバッグ性

* inspect があること
* validation report があること
* operation log があること
* exporter warning があること

---

## 31. 最終構成イメージ

```text
                         ┌────────────────────┐
                         │ presentation-core   │
                         └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │ packages/tools      │
                         └─────────┬──────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
┌──────▼───────┐           ┌───────▼────────┐          ┌───────▼────────┐
│ CLI          │           │ MCP Server     │          │ Consumer Agent │
│ local usage  │           │ Tool公開        │          │ Agent公開      │
└──────┬───────┘           └───────┬────────┘          └───────┬────────┘
       │                           │                           │
Codex / Shell              Codex / Claude Code          他Agent / Chat App
```

REST API は後続 adapter として追加する。

```text
presentation-core
  ↓
packages/tools
  ↓
api-server
  ↓
ChatGPT風アプリ backend
```

---

## 32. まとめ

このプロジェクトは以下を中心に実装する。

* `presentation-core`

  * Spec / IR / Operations / Inspect / Validation / Exporter interface
* `packages/tools`

  * protocol independent tool definitions
* `cli`

  * Codex / Claude Code / local workflow
* `mcp-server`

  * 他Agent向け tool 公開

  * 将来的な Presentation Agent 公開

初期実装では REST API を優先しない。

最初のゴールは以下。

```text
presentation.json
  ↓
validate
  ↓
export pptx
```

次のゴールは以下。

```text
User Request
  ↓
Brief / DeckPlan / SlideSpec
  ↓
PresentationIR
  ↓
Validate
  ↓
PPTX
```

最終ゴールは以下。

```text
Codex / Claude Code / ChatGPT風App / AgentCore
  ↓
Presentation Agent or Tools
  ↓
Spec Driven Presentation Runtime
  ↓
High-quality PPTX / HTML / PDF / JSON
```

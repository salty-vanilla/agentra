# Changelog

All notable changes to the **Agentra** workspace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

---

## [Unreleased]

### Added — deck-forge/core Phase 7A: TemplateProfile / Slot-based Layout Core

- **TemplateProfile type system** — `TemplateProfile`, `TemplateLayoutProfile`,
  `TemplateLayoutKind` (9 kinds), `TemplateSlotName` (15 slot names) in
  `packages/deck-forge/core/src/templates/`
- **Built-in template profile** `executive-navy-v1` with 9 layout profiles:
  cover, section, content-standard, content-two-column, dashboard-cards,
  visual-insight, table, process, blank — each with deterministic slot frames
- **`resolveTemplateLayout()`** — heuristic mapper from `LayoutSpec.type` and
  `strategyId` to the appropriate `TemplateLayoutProfile`; strategy-to-layout
  mapping (e.g. `executive-summary-kpi` → dashboard-cards, `data-insight-story`
  → visual-insight)
- **`LayoutContext` extended** with `templateProfile`, `templateLayout`, and
  `templateSlots` — strategies can read slot frames and fall back to regionFrames
- **`SubFrameAssignment.slot`** field — strategies annotate which template slot
  was used for each block placement
- **`SlideIR._trace` extended** with `templateProfileId`, `templateLayoutId`,
  `templateLayoutKind`, `usedSlots[]`, `fallbackSlots[]`
- **vitest exclude** — `infra/cdk/cdk.out/**` excluded from test discovery
- **34 new tests** covering template profile structure, resolveTemplateLayout
  mapping, buildPresentationIr trace integration, slot placement verification,
  and no-business-layout-explosion guard

### Changed — deck-forge/core Phase 7A

- **`buildPresentationIr()`** accepts optional `templateProfile` (defaults to
  `executive-navy-v1`); resolves template layout per slide after strategy
  selection; title/subtitle placement uses template slots when available
- **10 strategies slot-aware** — title-slide, section-divider,
  executive-summary-kpi, kpi-dashboard-with-insight, data-insight-story,
  small-multiples-trend, process-flow-with-impact, implementation-roadmap,
  action-plan-table, decision-request — each prefers template slot frames
  with fallback to regionFrames

### Added — deck-forge/core Phase 6C: Layout Stability Improvement

- **Standard layout band constants** (`LAYOUT_TITLE_Y`, `LAYOUT_BODY_Y`,
  `LAYOUT_BODY_BOTTOM`, `LAYOUT_CALLOUT_Y`, `LAYOUT_FOOTER_Y`, etc.)
  replace dynamic calculations in `defaultFrameForRole()` — single source
  of truth for all 27 layout strategies
- **Standard component size constants** (`STANDARD_KPI_CARD_HEIGHT = 200`,
  `STANDARD_CHART_HEIGHT = 280`, `STANDARD_CALLOUT_HEIGHT = 80`) in
  `grid-utils.ts` for consistent element sizing across strategies
- **Post-build overlap detection** in `buildPresentationIr` — union-find
  groups overlapping elements (> 8% ratio) and auto-stacks them vertically
  before any AI design/review pass, skipping exact duplicate frames from
  `splitVertical` overflow
- **Style-position conflict validation** — `validateLayout` now warns when
  an element's `style` object contains spatial keys (`x`, `y`, `left`,
  `top`, `position`), catching LLM-generated JSON that leaks position into
  style instead of using `frame`
- Layout band constants exported from `@deck-forge/core` index

### Changed — deck-forge/core Phase 6C

- **Vertical layout bands** — title h: 112→100, body y: 192→200,
  body bottom: 510→500, callout y: 510→520, callout h: 90→80,
  footer y: 600→620
- **Column grid** — gutter: 16→40 px, right column x: 752→680,
  body width: 656→560, visual width: 448→520 (more balanced split)
- **Two-column strategy** — gap increased from 24 to 40 px
- **KPI grid / dashboard strategies** — metric region height now targets
  `STANDARD_KPI_CARD_HEIGHT` per grid row instead of arbitrary 65%/45%
  ratios
- **Design-review loop** — default `maxIterations` reduced from 3→1
  (core) and `designReviewIterations` default from 2→1 (runtime), max
  still 3 and overridable per-request
- **Title/subtitle split** — title ratio adjusted from 60%→55% to fit
  within the narrower y=80..200 band

### Added — deck-forge/core Phase 6B: Component Renderer Polish

- **Chart renderer polish**
  - Chart title rendering above chart area (PPTX `addText` + HTML SVG `<text>`)
  - Smart legend: hidden for single-series charts by default; `legendPosition` style option
  - Data labels via `showDataLabels` style option (bar tops, line points, pie percentages)
  - Target/reference lines as dashed overlays with labels (`targetLines` style option)
  - Horizontal bar heuristic: auto-rotates when labels > 12 chars or > 5 categories
  - Pie chart direct labels with percentage + category name (HTML)
- **Process flow renderer polish**
  - Step number badges: accent-colored circle with number at top-left of each diagram node (PPTX + HTML)
- **Action plan table renderer polish**
  - Header row styled with theme primary color + contrasting text
  - Alternating row fills for readability
  - Per-cell formatting via cell objects; thinner borders; theme-aware colors
- **Insight/callout band polish**
  - Callout label detection: parses known prefixes ("Insight:", "Risk:", "Decision needed:", "Next action:", etc.)
  - Unicode prefix icons (💡⚠❓▶📌) rendered in accent color with bold label
  - Accent-bar decoration upgraded to visible surface fill + 2pt accent line
  - Minimum callout height enforced (0.5in)
- **Layout strategy tracing**
  - `SlideIR._trace` field: `{ layoutStrategyId, layoutSpecType }` per slide
  - Populated after `selectLayoutStrategy()` in build pipeline

### Changed — deck-forge/core Phase 6B

- `ChartElementIR` — add optional `title` field, wired from `ChartBlock.title`
- `ChartStyle` — add `showDataLabels`, `legendPosition`, `targetLines` (backward-compatible)
- `renderTableElement` — now receives `ThemeSpec` for theme-aware styling
- `buildElements` — returns `{ elements, layoutStrategyId }` tuple for trace propagation

### Added — deck-forge/core Phase 5: Text/Table Overflow Detection & Repair

- **Phase 5B** — text/table overflow repair engine (`ff85914`)
  - Font-size reduction repair for overflowing text and table elements
  - Dry-run mode support
  - Runner integration via `enableTextOverflowRepair` option
- **Phase 5A** — text/table overflow detection (`e7740db`)
  - Text measurement utilities (line estimation, text-box height)
  - Table height estimation
  - Rich-text extraction helpers
  - Content-density validation rules: `text-overflow-risk`, `title-too-long`, `bullet-list-too-dense`, `table-clipped`, `callout-too-dense`

### Added — deck-forge/core Phase 4: Deterministic Layout Repair

- **Phase 4b** — integrate deterministic repair into runner (`92ec6ca`)
- **Phase 4a follow-up** — harden repair engine (`f1eba63`)
- **Phase 4a** — deterministic layout repair engine (`2f45397`)
  - Overlap detection and resolution
  - Out-of-bounds element repair
  - Region-based reflow

### Added — deck-forge/core Phase 3: Element Operations

- Phase 3 follow-up — harden element operations (`7f642e7`)
  - `OperationHandlerResult` type for skipped-op observability
  - Deep-merge style updates, region reflow
- Phase 3 — expand `PresentationOperation` vocabulary (`c75d462`)
  - `move_element`, `resize_element`, `set_element_frame`, `set_element_region`, `update_element_style`

### Added — deck-forge/core Phase 2: Chart & Diagram Materialization

- `ChartBlock` → `ChartElementIR` conversion (`7983b34`)
- `DiagramBlock` → `DiagramElementIR` conversion
- Placeholder rendering for empty/invalid chart and diagram data

### Added — deck-forge/core Phase 1: Layout & Frame Synchronization

- Layout/frame synchronization in IR builder (`140e7b5`)

### Changed

- Integrate deck-forge workspace packages into monorepo (`cc29d49`, `2f06765`)

---

## 2026-04-30

### Added

- **deck-forge-runtime**: adopt deck-forge 0.3.1 + theme presets (`5135590`)
  - 6 curated themes (executive-navy, modern-mono, warm-pastel, tech-dark, eco-fresh, editorial-serif)
  - Align slide-designer schema with 0.3.1 `LayoutType` enum
  - Intent-parser `deckPlan` prompt with `SlideIntent.type` guidance
- Update operation planner and slide designer with enhanced rules and constraints (`4504d60`)
- Enhance slide generation and review processes (`40c3aa1`)
- **deck-forge**: vision reviewer + 1-pass revision loop (`53c6c3b`)
- **deck-forge**: persist full reproducibility bundle (IR + assets + request) to S3 (`54b1276`)
- **deck-forge**: integrate CloudWatch logging and migrate to v0.2.1 staged `tool_use` (`03ce2da`)
- **deck-forge-runtime**: upgrade to `@deck-forge/*` v0.2.0 (`491dbb7`)
- **deck-forge**: add Deck Forge AgentCore runtime and integrate as agent tool (`119ced8`)

### Fixed

- **deck-forge**: upgrade to `@deck-forge/core@0.2.2`, remove workarounds (`c7d6f7e`)
- **deck-forge**: remove `mustInclude`/`mustAvoid` forwarding to `validateSlideSpec` (`2f4a01e`)
- **deck-forge**: work around `core@0.2.1` IR-builder gaps for quality (`0645eb1`)
- **deck-forge**: materialize `generated://` asset URIs before publishing so PNG bytes reach S3 (`f7abddc`)
- **deck-forge**: route all app logs through pino shared logger to CloudWatch (`a3c2f3f`)

---

## 2026-04-25 – 2026-04-26

### Added

- Chat stream に observability イベントを追加し、要約を永続化 (`571e225`)
- **agentcore**: add date/weather/tavily tools and wire Tavily API key secret (`042a528`)
- Refine thread UX and observability UI (`8b3d4d7`)

### Fixed

- Remove `undefined` values in DynamoDB marshalling options (`cb38fed`)

---

## 2026-04-19 – 2026-04-20

### Added

- SSE streaming for `/chat` endpoint, replacing JSON response (`b8687a7`)
- AgentCore Runtime with Strands SDK, wired into backend (`be0b3e3`)
- Refactor CDK stacks for modular architecture and add web hosting support (`184c3aa`)
- Integrate AWS Bedrock agent runtime and support multiple models in chat (`38efed3`)

### Changed

- **infra**: stage-aware AWS deploy and AgentCore-only backend (`ce012c3`)
- **infra**: increase backend Lambda timeout for agent streaming (`c5758a0`)
- **infra**: allow invoke on AgentCore runtime endpoints (`7b06570`)
- **amplify**: switch frontend hosting to static output (`d0d727b`)
- **amplify**: pin Next.js 15 and fix CSS type resolution (`ecf204b`)
- **amplify**: build shared package before frontend build (`b82c4c5`)
- **auth**: enable Amplify OAuth listener for redirect flow (`e62631f`)

### Housekeeping

- Apply biome cleanup and refine local runtime flow (`7a08443`)

---

## 2026-04-19

### Added

- Initial commit — project scaffolding (`0f4193b`)
  - Next.js frontend with assistant-ui chat components
  - Backend BFF (Express / Lambda)
  - CDK infrastructure
  - Shared packages
  - Biome linting & formatting

---

# @deck-forge/core — Upstream Version History

> The following entries were carried over from `packages/deck-forge/core/CHANGELOG.md`
> and cover the upstream package releases prior to monorepo integration.

---

## @deck-forge/core 0.3.1

### Minor Changes

Expand component template catalog and layout strategy registry for
structurally appropriate slide layouts.

#### Component templates (`templates/components/*.json`)

19 new templates with `ContentBlock`-aware `propsSchema`:

- **Canonical slide kinds**: `title-slide`, `section-divider`, `agenda`,
  `closing-cta`, `thank-you`, `qa`, `quote-spotlight`.
- **Catalog gaps filled**: `chart-focus`, `hero-visual`, `comparison`.
- **`LayoutType` parity**: `three-column`, `matrix-2x2`, `dashboard`,
  `diagram-focus`, `image-left-text-right`, `text-left-image-right`,
  `timeline-horizontal`, `process-flow`.
- **`ContentBlock` coverage**: `metric-row`, `callout-spotlight`.

#### Layout strategies (`packages/core/src/builders/layouts/`)

8 new strategies registered in `BUILTIN_LAYOUT_STRATEGIES` with priority
tiers (80 / 70 / 60–30 / 0):

- `titleSlideStrategy`, `sectionDividerStrategy` (80)
- `comparisonStrategy`, `threeColumnStrategy`, `matrixStrategy`,
  `dashboardStrategy`, `timelineStrategy`, `diagramFocusStrategy` (70)

#### Capability detection (`component-catalog.ts`)

`detectCapability` rewritten with 4-tier resolution (SlideIntent.type →
LayoutSpec.type → ContentBlock heuristics → fallback).

---

## @deck-forge/core 0.3.0

### Minor Changes

Five layered additions to the IR→render/review pipeline. All additive.

#### Phase 1 — `LayoutStrategy` foundation

- `LayoutStrategy` interface with priority-sorted dispatch.
- `buildElements` delegates to the strategy registry.

#### Phase 2 — `SlideDesigner` plug-in

- `SlideDesigner` interface and `HeuristicSlideDesigner`.
- `LocalPresentationRuntime` gains `designSlide()` / `runDesignPass()`.
- MCP tool `presentation_design_pass`.

#### Phase 3 — `VisualReviewer` + design-review loop

- `VisualReviewer` interface and `runDesignReviewLoop()`.
- MCP tool `presentation_visual_review`.

#### Phase 4 — Decoration & typography tokens

- `TextElementIR.decoration` field (`card` / `accent-bar` / `divider`).
- `HtmlExporter` CSS variables, semantic bullet lists, accent stripes,
  decoration classes.
- `PptxExporter` honours decoration and renders `ShapeElementIR`.

#### Phase 5 — Chart, diagram, and shape exporters

- `HtmlExporter` renders `ChartElementIR` as inline SVG.
- `HtmlExporter` renders `DiagramElementIR` (cycle / matrix / horizontal).
- `PptxExporter` calls `addChart` / `addShape` with matching layouts.

---

## @deck-forge/core 0.2.3

### Bug Fixes

- **`renderTextElement`** — `shrinkText: true`, role-appropriate `valign`,
  `paraSpaceAfter` for bullets. Callout elements get `fill` + `line`.
- **`bulletListToRichText`** — Items become `RichParagraph` with
  `bullet: { indentLevel }` instead of `"  • …"` prefixes.
- **`splitVertical`** — Inter-block gap 12→18, minimum 60-unit height,
  overflow blocks clamped.
- **Title layout** — 60/40 split with 8-unit gap (no more overlay).
- **`renderImageElement`** — `sizing: { type: "contain" }` preserves
  aspect ratio.
- **Validation** — Min-frame-height warning for `frame.height < 60`.

---

## @deck-forge/core 0.2.2

### Bug Fixes

- **`defaultFrameForRole`** — Per-role layout frames no longer collapse to
  the same rectangle; `title`, `body`, `visual`, `callout`, `sidebar`,
  `footer` occupy distinct zones.
- **`MetricBlock`** — Now rendered as callout-role text elements.
- **`createTheme`** — Derives palette from `brief.visualDirection.mood`
  when `brief.brand.colors` is absent.
- **`buildAssetRegistry`** — No longer fabricates phantom element IDs.

---

## @deck-forge/core 0.2.1

- Initial public release on npm.
  - Biome linting & formatting

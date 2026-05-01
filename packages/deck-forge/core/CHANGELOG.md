# @deck-forge/core

## 0.3.1

### Minor Changes

The 0.3.1 release expands the component template catalog and the layout
strategy registry so the IR builder produces structurally appropriate
layouts for the canonical "kinds of slide" found in real decks (title,
section divider, agenda, comparison, dashboard, matrix, timeline, closing,
etc.). All changes are additive.

#### Component templates (`templates/components/*.json`)

19 new templates with `ContentBlock`-aware `propsSchema`:

- **Canonical slide kinds**: `title-slide`, `section-divider`, `agenda`,
  `closing-cta`, `thank-you`, `qa`, `quote-spotlight`.
- **Catalog gaps filled**: `chart-focus`, `hero-visual`, `comparison`
  (previously suggested by `detectCapability` but had no template body).
- **`LayoutType` parity**: `three-column`, `matrix-2x2`, `dashboard`,
  `diagram-focus`, `image-left-text-right`, `text-left-image-right`,
  `timeline-horizontal`, `process-flow`.
- **`ContentBlock` coverage**: `metric-row`, `callout-spotlight`.
- `propsSchema` reflects real block structure (e.g. `chart`, `metrics[]`,
  `events[]`, `quadrants[]`, `quote`, `diagram`) instead of the previous
  `{title, body}` placeholder.

#### Layout strategies (`packages/core/src/builders/layouts/`)

8 new strategies registered in `BUILTIN_LAYOUT_STRATEGIES` with explicit
priority tiers (80 = explicit slide-kind layouts, 70 = explicit body
LayoutTypes, 60–30 = content-driven, 0 = single-stack fallback):

- `titleSlideStrategy` (80) — `LayoutSpec.type === "title"`, centers all
  blocks with `alignment: center`.
- `sectionDividerStrategy` (80) — `LayoutSpec.type === "section"`,
  left-aligned with accent bar decoration.
- `comparisonStrategy` (70) — handles `comparison` /
  `image_left_text_right` / `text_left_image_right`; image side is
  dictated by the LayoutType, plain `comparison` splits blocks evenly.
- `threeColumnStrategy` (70) — three equal columns, round-robin block
  distribution.
- `matrixStrategy` (70) — 2×2 grid via `splitGrid`, card decoration.
- `dashboardStrategy` (70) — KPI grid in upper region + chart/table/text
  stacked below.
- `timelineStrategy` (70) — horizontal event lay-out via `splitHorizontal`.
- `diagramFocusStrategy` (70) — dominant diagram/image with caption stack
  below.

#### Capability detection (`component-catalog.ts`)

`detectCapability` rewritten with a 4-tier resolution order:

1. `SlideIntent.type` — `title`/`agenda`/`closing`/`comparison`/`timeline`/
   `process` map to dedicated capabilities regardless of content blocks.
2. `LayoutSpec.type` — explicit layout type wins over inferred content
   signals (covers all 15 `LayoutType` enum values).
3. `ContentBlock` heuristics — `quote` → `quote_spotlight`, `chart` +
   metrics → `dashboard`, `chart` alone → `chart_focus`, `diagram` →
   `diagram_focus`, ≥2 metrics → `metric_row`, `table` → `kpi_grid`,
   `image` → `hero_visual`, single `callout` → `callout_spotlight`.
4. Fallback: `two_column`.

`suggestComponentId` extended to map all 21 capabilities to template ids.

#### Tests

- `__tests__/layout-strategies.test.ts`: +11 tests covering the 8 new
  strategies (match priority, frame production, decoration hints).
- `__tests__/component-catalog.test.ts`: +10 tests covering the new
  `detectCapability` resolution against the default catalog.
- 273 tests total, all passing; `pnpm typecheck` clean.

## 0.3.0

### Minor Changes

The 0.3.0 release lifts the visual quality of the IR→render/review pipeline
through five layered additions. All changes are additive: existing IR
documents, MCP tool inputs, and exporter outputs remain backwards-compatible.

#### Phase 1 — `LayoutStrategy` foundation

- New `LayoutStrategy` interface in `packages/core/src/builders/layouts/`
  with priority-sorted dispatch (`hero=60`, `kpi-grid=50`, `two-column=30`,
  `single-stack=0`).
- `buildElements` in `build-presentation-ir.ts` now delegates to the strategy
  registry. Components in the catalog (kpi-grid, two-column, hero, timeline)
  pick the appropriate layout via `selectLayoutStrategy(...)`.
- Public exports: `LayoutStrategy`, `LayoutHints`, `LayoutContext`,
  `SubFrameAssignment`, `BUILTIN_LAYOUT_STRATEGIES`, `selectLayoutStrategy`.

#### Phase 2 — `SlideDesigner` plug-in

- New `SlideDesigner` interface in `packages/core/src/design/types.ts` and
  reference `HeuristicSlideDesigner` (idempotent, baseline-relative): short
  titles get 1.15× boost, long titles 0.85× shrink, dense callouts 0.85×
  body-baseline floored at 14 px, bold bullet runs receive the accent
  color.
- `LocalPresentationRuntime` gains a `designer` hook plus
  `designSlide(presentation, slideId, options?)` and
  `runDesignPass(presentation, options?)` methods.
- New MCP tool `presentation_design_pass` with
  `setSlideDesigner()`/`getSlideDesigner()` injection (registered both in
  `@deck-forge/mcp-server` and `@deck-forge/adapters`).

#### Phase 3 — `VisualReviewer` + design-review loop

- New `VisualReviewer` interface in `packages/core/src/review/types.ts` and
  `runDesignReviewLoop({ designer?, visualReviewer, renderer, maxIterations,
  stopWhen })` helper that pipes designer → renderer → reviewer → applyOps
  per iteration.
- `LocalPresentationRuntime` gains a `visualReviewer` hook plus a
  `visualReview(presentation, options?)` method.
- New MCP tool `presentation_visual_review` with
  `setVisualReviewer()`/`getVisualReviewer()` injection.

#### Phase 4 — Decoration & typography tokens

- `TextElementIR` gains an optional
  `decoration?: { kind: "card" | "accent-bar" | "divider"; color?: string }`
  field. `build-presentation-ir` propagates decoration via `decorationFromHints`
  (metric blocks default to `card`).
- `HtmlExporter` now emits `--space-{xs..xl}`, `--radius-{sm,md,lg}`, and
  `--shadow-{sm,md,lg}` CSS variables wired from the theme; renders bullet
  paragraphs as semantic `<ul><li class="indent-N">`; draws an accent stripe
  under titles; and applies `.deco-card`/`.deco-accent-bar`/`.deco-divider`
  classes to decorated elements.
- `PptxExporter` honours decoration on text elements (card → `fill` +
  `rectRadius` derived from `theme.radius.md`; accent-bar → coloured left
  border) and now renders `ShapeElementIR` via `addShape` for
  rect/round_rect/ellipse/line/arrow.

#### Phase 5 — Chart, diagram, and shape exporters

- `HtmlExporter` renders `ChartElementIR` (bar/line/area/pie/scatter; combo
  falls back to bar) as inline SVG using the theme palette, with optional
  legend and y-axis grid.
- `HtmlExporter` renders `DiagramElementIR` as inline SVG with three
  layouts: cycle (radial), matrix (grid), and a horizontal sequence used by
  flowchart/timeline/funnel/layered. Explicit edges become arrowed lines;
  flowchart/timeline/funnel/layered without edges get implicit consecutive
  arrows.
- `HtmlExporter` renders `ShapeElementIR` as inline SVG.
- `PptxExporter` calls `addChart` for charts (palette/legend/grid sourced
  from the theme) and emits `roundRect` node + `line` edge shapes for
  diagrams via `addShape`, using the same layout algorithm as the HTML
  exporter so HTML and PPTX previews stay consistent.

### Notes for downstream consumers (e.g. agentra)

deck-forge intentionally ships only interfaces for the LLM/VLM-powered
designer and reviewer. Concrete implementations should:

1. `import { setSlideDesigner } from "@deck-forge/tools"` and supply a
   designer that calls Bedrock/OpenAI/etc.
2. `import { setVisualReviewer } from "@deck-forge/tools"` and supply a VLM
   reviewer that returns `PresentationOperation`s.
3. Drive the loop with `runDesignReviewLoop` (or the new MCP tools
   `presentation_design_pass` and `presentation_visual_review`).

See `docs/release-0.3.0.md` for a worked agentra wiring example.

## 0.2.3

### Bug Fixes

- **PptxExporter / `renderTextElement`** — `addText` is now invoked with
  `shrinkText: true`, a role-appropriate `valign` (`title`/`callout` →
  `middle`, `footer` → `bottom`, otherwise `top`), and `paraSpaceAfter` when
  the text contains bullets. This prevents PowerPoint from growing the text
  shape past its frame and bleeding into adjacent regions, which was the
  primary visible cause of element overlap in exported decks. `callout`-role
  text additionally receives a `fill` (theme `surface`) and a thin `line`
  (theme `secondary`/`textSecondary`) so it reads as a distinct block.
  Regression test: `src/__tests__/pptx-exporter.render-options.test.ts`.
- **buildPresentationIr / `bulletListToRichText`** — Bullet items are no
  longer flattened to `"  • …"` text prefixes. Each item becomes a
  `RichParagraph` with a new optional `bullet: { indentLevel }` flag and a
  `spacingAfter` of 6 so the PPTX exporter can drive PptxGenJS native bullets
  (`bullet: true` / `bullet: { indent: n }` + `indentLevel`). This restores
  proper bullet line-height and indentation for nested lists, which were
  cramped and overflowed their frame in 0.2.2.
  Regression tests: `src/__tests__/build-presentation-ir.bugfixes-0.2.3.test.ts`,
  `src/__tests__/pptx-exporter.render-options.test.ts`.
- **buildPresentationIr / `splitVertical`** — When 3 or more blocks share a
  region, the inter-block gap widens from 12 to 18, and every sub-frame is
  guaranteed at least 60 units of height. If the region is too small to
  satisfy the minimum, the block count is clamped and overflow blocks reuse
  the last sub-frame so they cannot spill into adjacent regions; the
  resulting overlap is surfaced as a layout warning instead of silently
  rendering on top of the next region.
  Regression test: `src/__tests__/build-presentation-ir.bugfixes-0.2.3.test.ts`.
- **buildPresentationIr / title layout** — The `"title"` layout now splits
  the title region vertically into a top 60 % (title element) and bottom 40 %
  (subtitle element) with an 8-unit gap, instead of placing the title across
  the full title region and overlaying the subtitle at the 62 % mark. Long
  titles can no longer collide with their subtitle.
  Regression test: `src/__tests__/build-presentation-ir.bugfixes-0.2.3.test.ts`.
- **PptxExporter / `renderImageElement`** — `addImage` now passes
  `sizing: { type: "contain", w, h }` so images are scaled inside their frame
  while preserving the source aspect ratio, instead of being stretched and
  potentially extending past the frame visually.
  Regression test: `src/__tests__/pptx-exporter.render-options.test.ts`.
- **validation/rules/layout** — Added a min-frame-height warning: any element
  with `frame.height < 60` produces a `warning` ("frame height … below the
  minimum readable height of 60"). Existing overlap, out-of-bounds, and
  margin rules are unchanged.

### Internal

- **`RichParagraph`** gains an optional `bullet?: { indentLevel?: number }`
  field. The change is additive and backwards compatible.

## 0.2.2

### Bug Fixes

- **buildPresentationIr / `defaultFrameForRole`** — Per-role layout frames no
  longer collapse to the same `{x:80, y:80, width:1120, height:560}` rectangle.
  `title`, `body`, `visual`, `callout`, `sidebar`, and `footer` now occupy
  distinct, non-overlapping zones within the slide. Previously every
  non-title/non-footer region rendered on top of the body region, so any slide
  with more than one block produced a stack of overlapping shapes. Regression
  test: `src/__tests__/default-frame-for-role.test.ts`.
- **buildPresentationIr** — `MetricBlock` content blocks are now rendered as
  callout-role text elements (`label\nvalue unit ↑/↓`). Previously they were
  silently dropped because `buildElements()` had no `metric` branch.
  Regression test: `src/__tests__/build-presentation-ir.bugfixes.test.ts` (Bug A).
- **buildPresentationIr / `createTheme`** — When `brief.brand.colors` is
  absent, the theme now derives its palette from `brief.visualDirection.mood`
  (`energetic`, `calm`, `trustworthy`, `futuristic`, `premium`, `practical`).
  Previously `visualDirection` was ignored and every brandless deck rendered
  with the same default blue. Brand colors still take precedence when
  explicitly provided. Regression test: `src/__tests__/build-presentation-ir.bugfixes.test.ts`
  (Bug C).
- **buildPresentationIr / `buildAssetRegistry`** — `slideSpec.assets[]`
  references and `assetSpec.targetSlideIds` no longer fabricate
  `asset-ref-*` / `asset-target-*` element IDs in `asset.usage[].elementId`.
  These phantom IDs caused the validator to emit "non-existent element"
  warnings for every asset that wasn't paired with a real `ImageElementIR`.
  Real image elements still get a proper usage entry. Regression test:
  `src/__tests__/build-presentation-ir.bugfixes.test.ts` (Bug D).

## 0.2.1

- Initial public release on npm.

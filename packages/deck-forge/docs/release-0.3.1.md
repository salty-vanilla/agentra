# deck-forge 0.3.1

The 0.3.1 release expands the **component template catalog** and the
**layout strategy registry** so the IR builder produces structurally
appropriate layouts for the canonical "kinds of slide" found in real
decks (title, section divider, agenda, comparison, dashboard, matrix,
timeline, closing, etc.). Every change is additive — no IR types,
schemas, or MCP tools were removed or made stricter.

## Highlights

| Area | Before | After |
| --- | --- | --- |
| `templates/components/*.json` | 3 templates (`kpi-grid`, `timeline`, `two-column`), all with placeholder `{title, body}` schema | **22 templates** with `ContentBlock`-aware `propsSchema` |
| `BUILTIN_LAYOUT_STRATEGIES` | 4 strategies (hero, kpi-grid, two-column, single-stack); 11 of 15 `LayoutType` values fell through to `single-stack` | **12 strategies** covering every `LayoutType` enum value |
| `detectCapability` | 5-case if/else; ignored `SlideIntent`; 4 of 6 suggested ids had no matching template | 4-tier resolution (intent → layout type → content blocks → fallback) covering 21 capabilities |

The full per-package change list is in `packages/core/CHANGELOG.md`
(0.3.1 entry).

## What's new

### 1. Template catalog (19 new templates)

#### Canonical slide kinds

| Template | Capability | Typical `SlideIntent.type` |
| --- | --- | --- |
| `title-slide` | `title_slide` | `title` |
| `section-divider` | `section_divider` | (manual) |
| `agenda` | `agenda` | `agenda` |
| `closing-cta` | `closing_cta` | `closing` |
| `thank-you` | `thank_you` | `closing` |
| `qa` | `qa` | (manual) |
| `quote-spotlight` | `quote_spotlight` | (driven by `quote` block) |

#### Catalog gaps filled

`chart-focus`, `hero-visual`, `comparison` were already suggested by the
old `detectCapability` but had no template body — they are now real
templates.

#### `LayoutType` parity

`three-column`, `matrix-2x2`, `dashboard`, `diagram-focus`,
`image-left-text-right`, `text-left-image-right`, `timeline-horizontal`,
`process-flow` round out coverage of the 15-value `LayoutType` enum.

#### `ContentBlock` coverage

`metric-row` (≥2 `metric` blocks) and `callout-spotlight` (single
`callout`) cover content shapes that previously fell through to
`two-column`.

#### `propsSchema` quality

Every template's `propsSchema` now reflects the real shape of the
content blocks it represents (e.g. `chart`, `metrics[]`, `events[]`,
`quadrants[]`, `quote`, `diagram`, `axes`) instead of the previous
`{title, body}` placeholder. This makes the catalog directly useful as
agent guidance for `tool_use` payloads.

### 2. Layout strategies (8 new)

Strategies are registered with explicit priority tiers:

| Priority | Strategies | Match condition |
| --- | --- | --- |
| 80 | `title-slide`, `section-divider` | Explicit `LayoutSpec.type === "title" \| "section"` |
| 70 | `comparison`, `three-column`, `matrix-2x2`, `dashboard`, `timeline`, `diagram-focus` | Explicit body `LayoutSpec.type` |
| 60 | `hero` (existing) | `LayoutSpec.type === "hero"` or 1 image + ≤2 text blocks |
| 50 | `kpi-grid` (existing) | ≥2 metric blocks |
| 30 | `two-column` (existing) | image + body block |
| 0 | `single-stack` (existing) | always (fallback) |

Notable behaviours:

- **`comparisonStrategy`** unifies `comparison`, `image_left_text_right`,
  and `text_left_image_right`. For the directional variants the image
  goes to the dictated side; plain `comparison` splits blocks evenly
  (first half → left, second half → right).
- **`matrixStrategy`** uses `splitGrid(2, 2)` with `card` decoration for
  the canonical 4-quadrant layout.
- **`dashboardStrategy`** places metrics in an upper grid (`pickGridDimensions`)
  and stacks chart/table/text blocks below.
- **`timelineStrategy`** lays events horizontally via `splitHorizontal`,
  one card per event.
- **`diagramFocusStrategy`** gives the diagram 70% of the body height and
  stacks captions below.

### 3. `detectCapability` rewrite

The capability detector now resolves in a 4-tier order so the highest
specificity signal wins:

```
1. SlideIntent.type        ── title / agenda / closing / comparison /
                              timeline / process / …
2. LayoutSpec.type         ── all 15 LayoutType enum values
3. ContentBlock signals    ── quote / chart+metrics / chart / diagram /
                              ≥2 metrics / table / image / single callout
4. Fallback                ── two_column
```

`suggestComponentId` was extended to map all 21 capabilities to template
ids.

## Backwards compatibility

- Existing decks render identically. The new strategies only activate
  when their explicit `LayoutSpec.type` matches; the default
  `single_column` LayoutType still routes through the same priority
  ladder used in 0.3.0 (`hero` → `kpi-grid` → `two-column` →
  `single-stack`).
- `ComponentSpec`, `LayoutSpec`, `LayoutType`, and `SlideIntent` types
  are unchanged. No IR migration needed.
- `synthesizeComponents` continues to work for capabilities not yet in
  the catalog and now generates richer ids (e.g. `dashboard`,
  `metric-row`).

## Verification

- `pnpm typecheck` — clean
- `pnpm test` — 273 passing (39 test files)
  - `__tests__/layout-strategies.test.ts`: +11 tests for the 8 new strategies
  - `__tests__/component-catalog.test.ts`: +10 tests for the new
    `detectCapability` resolution against the default catalog
- `pnpm biome check .` — clean

## Related

- 0.3.0 release notes: [`docs/release-0.3.0.md`](release-0.3.0.md)
- Per-package CHANGELOG: [`packages/core/CHANGELOG.md`](../packages/core/CHANGELOG.md)
- Runtime design overview: [`docs/presentation-runtime-design.md`](presentation-runtime-design.md)

# deck-forge 0.3.0

The 0.3.0 release lifts the visual quality of the IR→render/review pipeline
without changing any existing IR/MCP surface. Every addition is opt-in and the
defaults are conservative so existing decks continue to render the same way.

## Highlights

| Phase | Area | Summary |
| --- | --- | --- |
| 1 | Layout | `LayoutStrategy` registry; `kpi-grid`, `two-column`, `hero`, `single-stack` strategies dispatched by priority. |
| 2 | Design | `SlideDesigner` interface + `HeuristicSlideDesigner` reference impl + `presentation_design_pass` MCP tool. |
| 3 | Review | `VisualReviewer` interface + `runDesignReviewLoop` helper + `presentation_visual_review` MCP tool. |
| 4 | Tokens | `ElementDecoration` on `TextElementIR`; HTML & PPTX exporters honour spacing/radius/shadow tokens, render bullets as `<ul><li>`, draw a title accent stripe, and apply `.deco-card` / `.deco-accent-bar` / `.deco-divider`. |
| 5 | Charts/Diagrams/Shapes | HTML inline-SVG renderers; PPTX `addChart` + `addShape` (round-rect node + line edges) using a shared layout algorithm. |

The full per-package change list is in `packages/core/CHANGELOG.md` (0.3.0
entry).

## Architectural commitments

- **LLM-independent core.** deck-forge does not depend on any LLM SDK. The
  new `SlideDesigner` and `VisualReviewer` types are pure interfaces.
  Concrete LLM/VLM-powered designers and reviewers belong in agentra (or
  any other downstream package).
- **Backwards-compatible.** No IR types were removed or made stricter. Only
  optional fields and brand-new modules were added. Deck JSON written by
  0.2.x continues to load and render in 0.3.0.
- **Same renderer for HTML & PPTX where possible.** Diagrams use the same
  layout algorithm in both exporters so the rendered preview matches the
  exported deck.

## Wiring example for agentra

```ts
import {
  buildPresentationIr,
  HtmlSlideImageRenderer,
  runDesignReviewLoop,
  type SlideDesigner,
  type VisualReviewer,
} from "@deck-forge/core";
import {
  setSlideDesigner,
  setVisualReviewer,
} from "@deck-forge/tools";

// 1. Concrete designer that calls a text LLM.
const llmDesigner: SlideDesigner = {
  name: "claude-designer",
  async design({ presentation, slideId }) {
    // …call Bedrock/OpenAI/etc., return PresentationOperation[]
    return { operations: [], rationale: { summary: "…" } };
  },
};

// 2. Concrete reviewer that calls a VLM on rendered slide images.
const vlmReviewer: VisualReviewer = {
  name: "claude-vlm-reviewer",
  async review({ presentation, slideImages }) {
    // …call a VLM, parse findings + operations
    return { findings: [], operations: [] };
  },
};

// 3a. Use directly.
const ir = buildPresentationIr({ brief, deckPlan, slideSpecs });
const result = await runDesignReviewLoop({
  presentation: ir,
  designer: llmDesigner,
  visualReviewer: vlmReviewer,
  renderer: new HtmlSlideImageRenderer(),
  maxIterations: 3,
});

// 3b. Or register globally so the MCP tools pick them up.
setSlideDesigner(llmDesigner);
setVisualReviewer(vlmReviewer);
// → presentation_design_pass and presentation_visual_review now work end-to-end
```

## New MCP tools

| Tool | Input | Output |
| --- | --- | --- |
| `presentation_design_pass` | `{ presentation, slideIds?, focus? }` | `{ operations, rationale, presentation }` |
| `presentation_visual_review` | `{ presentation, slideImages?, focus? }` | `{ findings, operations }` (does not auto-apply) |

Both tools throw a structured `DESIGNER_ERROR` / `VISUAL_REVIEWER_ERROR` if
no implementation has been registered.

## New IR field

```ts
type ElementDecoration = {
  kind: "card" | "accent-bar" | "divider";
  color?: string;
};

type TextElementIR = {
  // …existing fields…
  decoration?: ElementDecoration;
};
```

Metric blocks now default to `{ kind: "card" }` so KPI grids automatically
render as visually distinct cards.

## Test coverage

- `layout-strategies.test.ts` — Phase 1
- `heuristic-slide-designer.test.ts`, `design-pass-handler.test.ts` — Phase 2
- `design-review-loop.test.ts`, `visual-review-handler.test.ts` — Phase 3
- `html-exporter.decoration.test.ts`, `pptx-exporter.shape.test.ts` — Phase 4
- `html-exporter.chart-diagram.test.ts`,
  `pptx-exporter.chart-diagram.test.ts` — Phase 5
- `release-0.3.0-integration.test.ts` — end-to-end build → designer → loop →
  HTML export

Total: 252 tests, all green.

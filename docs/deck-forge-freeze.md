# DeckForge Typed Strategy Engine — Freeze Notice

## Status: Frozen (experimental)

**Freeze tag:** `deck-forge-typed-engine-freeze-v0`

## Summary

DeckForge reached **Phase 8J** as an experimental typed strategy engine for
AI-driven presentation generation. The engine explored a fully typed pipeline
comprising:

- **StrategyInput / StrategySelector** — deterministic + LLM-first strategy
  selection with audience normalization and diversity penalties
- **PresentationIR** — intermediate representation for slides, elements,
  charts, and diagrams
- **Operation handlers** — typed element operations (move, resize, set-frame,
  set-region, update-style) with skipped-op observability
- **Template / Layout resolution** — business-strategy-aware template matching
- **Quality gates & diagnostics** — content density validation, layout repair,
  golden-deck evaluation
- **PPTX export** — PptxGenJS-based exporter with chart/diagram placeholders
- **Bedrock runtime** — intent parsing, slide design, theme presets, visual
  review loop

## Why frozen

The project is pivoting to a new `presentation-author` package based on an
OpenAI slides-skill-like PptxGenJS authoring workflow. New work should **not**
continue the StrategyInput → StrategySelector → PresentationIR path.

## Recovery

To recover the full DeckForge implementation:

```bash
git checkout deck-forge-typed-engine-freeze-v0
```

All code, tests, and history are preserved in Git at that tag. The following
paths were part of the frozen implementation:

- `packages/deck-forge/*` (core, adapters, cli, tools, runner, schemas, mcp-server)
- `apps/deck-forge-runtime/`
- `infra/cdk/lib/agentra-deck-forge-runtime-stack.ts`
- `templates/components/`

## Date

2026-05-03

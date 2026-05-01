# deck-forge 0.2.0 Release Notes

## Packages

- `@deck-forge/core@0.2.0`
- `@deck-forge/tools@0.2.0`
- `@deck-forge/runner@0.2.0`
- `@deck-forge/adapters@0.2.0`
- `@deck-forge/cli@0.2.0`
- `@deck-forge/mcp-server@0.2.0`

## Highlights

- Node-compatible `#src/*` package imports replace the invalid `#/...` imports.
- Runner create mode requires Agent-authored `createArtifacts` instead of rule-based deck generation.
- Retrieved image planning supports `imageProvider`, defaulting to `pexels`.
- Review packets carry validation, inspect context, grounding, and optional slide images.
- `presentation_export_slide_images` renders PNG/JPEG review assets when a renderer is available.
- `reviewTrigger: "warnings"` allows Agent review for warning-only quality gates.

## AgentCore Usage

```ts
import { DeckForgeRunner } from "@deck-forge/runner";
import { createLocalRuntime } from "@deck-forge/core";

const runner = new DeckForgeRunner({
  runtime: createLocalRuntime(),
  revisionPolicy: "ai_review",
  reviewTrigger: "warnings",
  intentParser,
  reviewer,
  operationPlanner,
});
```

For slide images, install Playwright and explicitly opt in:

```ts
import { HtmlSlideImageRenderer, createLocalRuntime } from "@deck-forge/core";

const runtime = createLocalRuntime({
  slideImageRenderer: new HtmlSlideImageRenderer(),
});
```

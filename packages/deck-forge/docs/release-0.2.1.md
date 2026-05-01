# Release Notes — v0.2.1

## Summary

v0.2.1 ships the building blocks required for a **staged `tool_use` LLM
architecture** in `IntentParser`. Each artifact stage (Brief → DeckPlan →
SlideSpec) now has a dedicated JSON Schema constant, a non-throwing per-stage
validator, and a reference system prompt template. TypeScript types and JSON
Schemas are derived from the same Zod definitions, so they can never drift.

---

## Breaking Changes

### `@deck-forge/tools`

| Symbol | Before | After |
|--------|--------|-------|
| `ValidateAgentCreateArtifactsOutput` | `{ artifacts: CreatePresentationArtifacts }` — **throws** on failure | `{ valid: boolean; issues: string[]; artifacts?: CreatePresentationArtifacts }` — **never throws** |

Callers that previously relied on `try/catch` around
`validateAgentCreateArtifacts` should switch to checking `result.valid`.
The built-in runner already handles this automatically.

---

## New Features

### 1. Zod-backed artifact schemas (`@deck-forge/core`)

All five artifact types now have canonical Zod schemas as the single source of
truth for both TypeScript types and JSON Schemas:

```
packages/core/src/schemas/intent-artifacts.ts
```

Exported schemas: `BriefSchema`, `DeckPlanSchema`, `SlideSpecSchema`,
`ContentBlockSchema`, `AssetSpecSchema` (plus all sub-shape schemas).

All existing TS type names (`PresentationBrief`, `DeckPlan`, `SlideSpec`, …)
continue to be exported from `@deck-forge/core` as `z.infer` aliases — no
changes needed in consumers.

### 2. JSON Schema constants for `tool_use` (`@deck-forge/tools`)

Five new exports ready to drop into an Anthropic `tool.input_schema` or an
OpenAI function `parameters`:

```ts
import {
  BRIEF_JSON_SCHEMA,
  DECK_PLAN_JSON_SCHEMA,
  SLIDE_SPEC_JSON_SCHEMA,
  CONTENT_BLOCK_JSON_SCHEMA,
  ASSET_SPEC_JSON_SCHEMA,
} from "@deck-forge/tools";
```

Generated at module load via `z.toJSONSchema` (Zod v4, target `draft-7`).
ContentBlock and AssetSpec emit `oneOf` discriminated unions.

### 3. Per-stage non-throwing validators (`@deck-forge/tools`)

Each stage can now be validated independently without throwing, enabling
targeted retry in a staged LLM loop:

```ts
import { validateBrief, validateDeckPlan, validateSlideSpec } from "@deck-forge/tools";

const r = validateBrief(brief, { expectedLanguage: "ja" });
if (!r.valid) {
  // r.issues is a string[], retry just this stage
}
```

| Function | Notable options |
|----------|----------------|
| `validateBrief(brief, { expectedLanguage? })` | Language mismatch check |
| `validateDeckPlan(deckPlan, { slideIds?, expectedSlideCount? })` | Cross-checks slide id sets |
| `validateSlideSpec(slide, { mustInclude?, mustAvoid?, applyGenericFillerCheck? })` | Per-slide content checks |

All return `ValidationResult = { valid: boolean; issues: string[] }`.

The aggregate `validateAgentCreateArtifacts` now also returns this shape (plus
`artifacts?` on success) and **never throws**.

### 4. Reference system prompt builders (`@deck-forge/tools`)

Per-stage system prompt templates for guiding the model's focus:

```ts
import {
  getBriefGenerationPrompt,
  getDeckPlanGenerationPrompt,
  getSlideSpecGenerationPrompt,
} from "@deck-forge/tools";

const sys = getBriefGenerationPrompt({ goal, audience, language: "ja" });
```

All three functions are language-aware (Japanese/English) and include
built-in filler-avoidance instructions.

---

## Architecture Enabled

```
User request
    │
    ▼
[Step 1] Free-text LLM → goal / audience / language
    │
    ▼
[Step 2] tool_use + BRIEF_JSON_SCHEMA → PresentationBrief
    │                validateBrief()     → retry if invalid
    ▼
[Step 3] tool_use + DECK_PLAN_JSON_SCHEMA → DeckPlan
    │                validateDeckPlan()    → retry if invalid
    ▼
[Step 4] tool_use + SLIDE_SPEC_JSON_SCHEMA → SlideSpec (parallelizable)
    │                validateSlideSpec()    → retry individual slide
    ▼
[Step 5] validateAgentCreateArtifacts → StructuredIntent.createArtifacts
    │
    ▼
[Runner] buildPresentationIr → export
```

---

## Fixes

- `validateAgentCreateArtifacts` previously crashed with an uncaught
  exception when `deckPlan.sections` or `slide.content` was absent. The new
  implementation guards every access through Zod `safeParse`.
- Runner now emits `NLU_PARSE_ERROR` (not `VALIDATION_ERROR`) when the
  IntentParser returns an intent with no `createArtifacts` at all, preserving
  correct telemetry classification.

---

## Tests

28 new tests added (176 total, all passing):

- `packages/tools/src/__tests__/intent-parser-schemas.test.ts` — JSON schema shape,
  discriminated unions, required fields, and all four validators including
  aggregate.
- `packages/tools/src/__tests__/intent-parser-prompts.test.ts` — prompt content,
  JA/EN switching, graceful degradation for unknown slide ids.

---

## Dependencies

| Package | Change |
|---------|--------|
| `@deck-forge/core` | `zod ^4.4.1` added as runtime dependency |
| `@deck-forge/tools` | `zod ^4.4.1` added as runtime dependency |

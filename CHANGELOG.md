# Changelog

All notable changes to the **Agentra** workspace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

---

## [Unreleased]

### Changed — Remove DeckForge dependency & simplify progress display

- **Removed `bedrock-slide-agent.ts`**: BFF no longer calls SlideRuntime directly; all slide requests go through Router Agent only
- **Removed `/api/presentations` endpoint**: No direct presentation API — Router handles delegation via `create_slide_presentation` tool
- **Removed `bedrock-slide-agent.test.ts`**: Tests for deleted module
- **Simplified BFF progress**: Replaced 6-phase silence-based timer with single "スライドを作成しています" spinner message; added TODO for future AsyncQueue-based real progress
- **Router `create-slide-presentation` tool**: Simplified to `prompt` + `language` params only (removed DeckForge-specific fields)
- **Router `slide-runtime-client.ts`**: Simplified response parsing — removed DeckForge artifact handling, returns `{ success, text, error? }`
- **Handoff skill**: Added DeckForge-era field deprecation notes to SKILL.md
- **Frontend `agentra-workspace.tsx`**: Enhanced slide command detection and progress display with spinner UI
- **Frontend `thread.tsx`**: Added progress summary event rendering
- **Frontend `api.ts`**: Handle `progress_summary` SSE event type
- **OpenAPI spec**: Added `progress_summary` SSE event schema to `agentra-bff.openapi.yaml`
- **Shared `chat.ts`**: Added `progressPhaseSchema`, `ProgressSummaryEvent` type, and `ChatCommand` schema

### Changed — PA-9.1: Skills colocated with runtimes

- **Skills moved into runtimes**: Each runtime now owns its `skills/` directory instead of a shared top-level `skills/`
  - `skills/presentation-author-handoff/` → `apps/agentcore-runtime-ts/skills/presentation-author-handoff/`
  - `skills/presentation-author/` → `apps/presentation-author-runtime/skills/presentation-author/`
- **`AgentSkills` path**: Both `agent.ts` files now use `join(__dirname, '../skills')` — no cross-package path resolution needed
- **Dockerfile updates**: Both Dockerfiles `COPY skills ./skills` so SKILL.md files are available inside containers at runtime
- **Removed**: Top-level `skills/` directory (redundant after move)

---

## [PA-9] — 2026-05-04

### Added — PA-9: Presentation Author Skill Packaging & Router Handoff

- **`skills/presentation-author/`**: Slide Agent skill with YAML frontmatter SKILL.md (name, description, allowed-tools), README, references, and examples
- **`skills/presentation-author-handoff/`**: Compact Router handoff skill — delegation triggers (JP/EN), tool to call, result presentation rules
- **Strands `AgentSkills` plugin**: Both agents use `AgentSkills` from `@strands-agents/sdk/vended-plugins/skills` for on-demand skill loading instead of system prompt injection
- **Router Agent**: `AgentSkills` plugin with `presentation-author-handoff` skill — metadata only in system prompt, full instructions loaded via `skills` tool call
- **Slide Agent**: `AgentSkills` plugin with `presentation-author` skill — font policy, deck quality, artifact response, diagnostics/revision loaded on-demand
- **Removed**: Custom `getPresentationAuthorRouterInstructions()` / `getPresentationAuthorSlideAgentInstructions()` loaders replaced by native SDK plugin
- **References** preserved: router-handoff.md, slide-agent-guidance.md, font-policy.md, artifact-response.md, tool-contract.md, diagnostics-revision.md
- **Tests** (21 + 7): SKILL.md frontmatter validation, skill file existence (10), content separation assertions, AgentSkills integration checks

### Fixed — PA-8.5: Deploy & Chat E2E Smoke — runtime fixes for full chat→router→slide handoff

- **Dockerfile** (`apps/presentation-author-runtime/Dockerfile`):
  - 3-stage build (build + python + prod): Python venv built in parallel stage, copied into prod
  - `pnpm deploy --legacy` + `cp -rL` + `npm install --omit=dev` to resolve workspace dep transitive dependencies (pptxgenjs etc.) without hacks
  - Removed inline `python3-pip`/`python3-venv` apt installs; use pre-built venv from python stage
  - Docker context moved to monorepo root (`directory: join(__dirname, '../../..')`) with explicit `file:` path
- **Slide runtime agent** (`apps/presentation-author-runtime/src/agent.ts`):
  - Added `BedrockAgentCoreApp` runtime wrapper with `RequestSchema` (prompt, language, diagnostics, revision)
  - Non-streaming `process()` handler that consumes Strands agent stream and returns `{ type: 'text', text }` (router invokes with `accept: application/json`)
  - Increased `maxTokens` 4096 → 32768 for slide agent model calls
  - Default model ID `us.anthropic.claude-sonnet-4-6` → `global.anthropic.claude-sonnet-4-6`
  - Region fallback: `BEDROCK_REGION` → `AWS_REGION`
- **Router agent** (`apps/agentcore-runtime-ts/src/agent.ts`):
  - maxTokens per-call limits increased: short 512→1024, normal 2048→4096, detailed 4096→8192
- **Backend** (`apps/backend/src/lib/bedrock-agent.ts`):
  - Model IDs `us.anthropic.claude-*` → `global.anthropic.claude-*`
- **LLM adapter** (`apps/presentation-author-runtime/src/llm-adapter.ts`):
  - Default model ID → `global.anthropic.claude-sonnet-4-6`, region fallback `BEDROCK_REGION` → `AWS_REGION`
- **CDK — AgentCoreRuntime** (`infra/cdk/lib/agentra-agentcore-runtime-stack.ts`):
  - Replace `CfnParameter` for Tavily API key with direct context/props lookup (avoids CloudFormation parameter prompt)
  - `SecretValue.cfnParameter()` → `SecretValue.unsafePlainText()` for Secrets Manager
- **CDK — SlideRuntime** (`infra/cdk/lib/agentra-slide-runtime-stack.ts`):
  - Add `BEDROCK_MODEL_ID` and `PRESENTATION_AUTHOR_MODEL_ID` env vars (`global.anthropic.claude-sonnet-4-6`)
- **CDK — Bedrock** (`infra/cdk/lib/agentra-bedrock-stack.ts`):
  - `BEDROCK_MODELS` map: `us.anthropic.*` → `global.anthropic.*`
- **Runtime package.json**: Added `bedrock-agentcore` dependency

### Added — presentation-author: PA-5 AgentCore-ready tool wrapper

- **`tool-types.ts`**: `CreatePresentationToolInput`, `CreatePresentationToolOutput`, `CreatePresentationArtifact` — stable tool-boundary types
- **`create-presentation-tool.ts`**: `createPresentation()` high-level function wrapping `runPresentationAuthor()` with structured success/failure output, input validation, language inference, error mapping, and summary builder
- **`artifacts.ts`**: `collectPresentationArtifacts()`, `extractContactSheetPath()`, `extractRenderedSlidePaths()`, `fileExists()` — artifact extraction helpers
- **`docs/agentcore-tool-usage.md`**: Registration guide with pseudo-code for Strands/AgentCore tool wrapping
- **`fixtures/manufacturing-line-q2-report/`**: Dogfooding fixture with prompt and expected-notes
- **Tests**: 19 new tests — successful output, defaults, input validation (empty/whitespace/oversized), script validation/execution failure mapping, artifact collection, language inference, summary builder, error mapping

### Fixed — presentation-author: dogfood fixes & skia-canvas avoidance

- **`prompts.ts` / `revision-prompts.ts`**: Replace `require("./helpers/pptxgenjs_helpers")` (which eagerly loads `text.js` → `skia-canvas` native binary) with targeted submodule imports (`util`, `layout`); remove `autoFontSize` / `calcTextBox` references; add "size text boxes generously" heuristic
- **`authoring-script.ts`**: Relax `deck.pptx` filename validation from hard error to warning (LLM sometimes uses a variable for the filename)
- **`scripts/dogfood.ts`**: Resolve `OUTPUT_DIR` to absolute path (fixes doubled-path in child process `cwd`); increase `max_tokens` 8192 → 16384 (prevents truncated scripts)

### Added — presentation-author: PA-4 Lite single diagnostics-driven revision

- **`revision-prompts.ts`**: `buildSingleRevisionPrompt()` — compact diagnostics summary + revision constraints
- **`revision.ts`**: `reviseAuthoringScript()` (LLM call + extract/validate) and `runSingleRevisionAttempt()` (full revision workspace lifecycle)
- **Runner integration**: `PresentationAuthorInput.revision` option (`boolean | RevisionOptions`); `PresentationAuthorResult.revision` field with `RevisionAttemptResult`
- **`RevisionAttemptResult`**: tracks `attempted`, `succeeded`, `reason` (disabled / diagnostics-pass / diagnostics-not-run / revision-succeeded / revision-*-failed / revision-output-missing)
- **Diagnostics injection**: `PresentationAuthorDeps.runDiagnostics` optional override for testing without LibreOffice
- **Tests**: 7 revision tests (disabled preserves PA-3, skip on pass, revise on warn, validation/execution/output failure keeps initial, prompt constraints)

### Added — presentation-author: PA-3 render / diagnostics wrappers

- **`python-runner.ts`**: Generic Python script execution utility (`runPythonScript()`)
- **`render.ts`**: `renderPresentation()` — calls `render_slides.py`, returns PNG paths
- **`contact-sheet.ts`**: `createContactSheet()` — calls `create_montage.py`, produces a montage PNG
- **`validation.ts`**: `validatePresentationOverflow()` (overflow detection) and `detectPresentationFonts()` (font audit)
- **`diagnostics.ts`**: `runPresentationDiagnostics()` — orchestrates all checks, returns pass/warn/fail status
- **Runner integration**: `PresentationAuthorInput.diagnostics` option; result includes `diagnostics` field
- **Tests**: Unit tests for `python-runner`, env-gated integration tests for render/overflow/fonts
- **`python/requirements.txt`**: pdf2image, Pillow, python-pptx, numpy
- **`scripts/smoke-render.ts`**: Manual smoke test script
- **Dependencies**: fontkit, linebreak, mathjax-full, prismjs, skia-canvas (required by vendor pptxgenjs_helpers)

### Changed — presentation-author: Vendor copy OpenAI slides skill

- **Vendor copy** (`packages/presentation-author/vendor/openai-slides/`):
  - Vendor-copied `openai/skills` repo `codex/fax-machine-skill` branch `skills/.curated/slides/` directory
  - Includes: `assets/pptxgenjs_helpers/` (9 JS modules), `scripts/` (5 Python scripts), `SKILL.md`, `references/`, `agents/`, `LICENSE.txt`
  - Source commit: `7b54889398822db28c72aeec8e95be7c20418d1a`
- **Removed** `packages/presentation-author/assets/` and `scripts/` (replaced by vendor copy)
- **Updated** `workspace.ts`: paths now reference `vendor/openai-slides/` within the package
- **Updated** `package.json`: `files` field includes `vendor` instead of `assets`/`scripts`
- **Updated** test: use `safeOuterShadow` from `util.js` (no native deps) instead of `autoFontSize` (requires `skia-canvas`)

### Added — deck-forge Phase 8J: LLM StrategyInput Generation, Audience Normalization & Strategy Diversity

- **Audience normalization** (`convert-to-canonical-deck-plan.ts`):
  - Expanded `BRIEF_AUDIENCE_TO_CANONICAL` map with Japanese keys (経営層, 役員, 取締役, 開発者, エンジニア, 製造現場, 運用担当, etc.) and English synonyms (CxO, Senior Management, etc.)
  - Added `AUDIENCE_SUBSTRING_PATTERNS` for composite labels like "経営層（取締役・役員・部長級）"
  - `inferAudience()` now tries exact match → substring pattern → fallback to "general" with warning
- **Text signal scoring** (`intent-to-strategy.ts`):
  - `TEXT_SIGNAL_RULES` array with 7 rules matching keyMessage/audienceTakeaway to strategy affinity (trend, root-cause, process, action-plan, decision, KPI, comparison)
  - `computeTextSignalScore()` applied as bonus in candidate scoring loop
- **Strategy diversity penalty** (`deterministic-strategy-selector.ts`):
  - `rerankCandidates()` penalizes overused strategies (≥50% of previous selections → penalty 3+count)
  - Final-slide heuristic: penalizes generic KPI strategies (+5), boosts decision strategies (−3) on decision/approval slides
  - `select()` accepts `previousSelections`, `slideCount`, `slideIndex` context
- **Deck context threading** (`strategy-pipeline.ts`, `select-strategy-for-intent.ts`, `strategy-selector.ts`):
  - `previousSelections` tracking array accumulated across slides
  - `StrategySelectionInput` extended with optional `previousSelections`, `slideCount`, `slideIndex`
- **`LlmFirstStrategyInputGenerator`** (`llm-strategy-input-generator.ts` — new):
  - Tries LLM generation first, validates against strategy schema, strips forbidden layout/styling keys, falls back to `DeterministicStrategyInputGenerator`
  - `stripForbiddenKeys()` recursively removes x, y, width, height, fontSize, fill, stroke, color, shape, position
  - `buildLlmStrategyInputSystemPrompt()` / `buildLlmStrategyInputUserMessage()` prompt builders with language/audience hints
  - Supports `mode: "llm" | "deterministic" | "fallback"` override
- **Bedrock implementation** (`strategy-input-bedrock.ts` — new):
  - `createBedrockStrategyInputGenerateFn()` using `invokeBedrockToolUse` with `generate_strategy_input` tool
- **Runtime integration** (`deck-forge-runtime/src/index.ts`):
  - Strategy pipeline uses `LlmFirstStrategyInputGenerator` with mode from `request.strategyInputMode` (default: "llm")
  - Strategy-input-summary logging after pipeline
  - `resolveRuntimeQualitySummary()` combines stabilization, strategy quality, strategy input source ratios, and design review trace into unified `quality` response
- **`strategyInputMode`** request field in `schemas.ts`: `"llm" | "deterministic" | "fallback"` (default: `"llm"`)
- **32 new tests**:
  - `audience-normalization.test.ts` (13): Japanese/English/substring/unknown/missing audience mapping
  - `strategy-selection-diversity.test.ts` (7): 8I dogfooding fixture diversity, text signals, final-slide heuristic, diversity penalty
  - `llm-strategy-input-generator.test.ts` (12): stripForbiddenKeys, LLM success/fallback/error paths, prompt builders

### Added — deck-forge Phase 8I: Runtime Strategy Pipeline Integration

- **`convertParsedDeckPlanToCanonicalDeckPlan()`** — bridge from Zod `ParsedDeckPlan` (sections/SlidePlan) to canonical strategy `DeckPlan` (flat SlideIntent[])
  - Maps all 13 SlideIntentSchema types to CommunicationIntent
  - Maps ContentRequirement.expectedBlockType to ContentKind
  - Infers audience/genre from PresentationBrief
  - Warns on unmapped values with graceful fallbacks
- **Runtime integration** (`deck-forge-runtime/src/index.ts`) — strategy pipeline injected after `runCreatePipeline()`:
  1. Converts LLM `ParsedDeckPlan` → canonical `DeckPlan`
  2. Runs `runStrategyPipeline()` to produce enhanced SlideSpecs with `strategyInput` + `preferredStrategyId`
  3. Replaces LLM-generated slideSpecs in pipeline intent
  4. Runs strategy quality diagnostics after IR build (opt-in via `qualityDiagnostics` flag)
  5. Logs detailed strategy pipeline and quality diagnostics events
  6. Includes `strategyQuality` summary in success response
- **`qualityDiagnostics`** request flag in `schemas.ts` (default: `true`)
- **`ParsedDeckPlan`** exported from `@deck-forge/core` — distinct from strategy `DeckPlan`
- **Type fixes across tools/runner/runtime** — `DeckPlan` imports corrected to `ParsedDeckPlan` where Zod shape is used
- **Runtime-path E2E smoke test** — exercises the actual runtime path:
  ParsedDeckPlan → `convertParsedDeckPlanToCanonicalDeckPlan()` → `runStrategyPipeline()` →
  inject strategy-enhanced slideSpecs → `DeckForgeRunner.run()` → assert IR quality
  (5-slide fixture: title / dashboard / two\_column / diagram\_focus / single\_column)
- **`validateSlideSpec`** — allow empty `content[]` when `strategyInput` is present
  (native strategy pipeline path produces slideSpecs with `content: []`)
- **11 converter tests** + **2 core E2E tests** + **1 runtime-path E2E test**
- No archetype dependency — strategy pipeline is archetype-free

### Fixed — deck-forge/core Phase 8H-fix: Type-safe intent/contentKind mapping

- **SchemaSlideIntentType** now derived from `z.infer<typeof SlideIntentSchema>["type"]` — compile error if Zod schema changes
- **LayoutType** now uses `LayoutIntent` (Zod-inferred) instead of hand-written union — compile error if schema changes
- Removed `LayoutTypeSchema` unused import
- No stale intent literals found (mapping was already type-safe via `Record<CommunicationIntent, ...>`)
- No stale ContentKind literals found (mapping was already `Partial<Record<ContentKind, ...>>`)
- **27 new tests**: exhaustive CommunicationIntent (10) and ContentKind (17) mapping coverage
- Total pipeline tests: 46

### Added — deck-forge/core Phase 8H: Runtime Pipeline Integration

- **`runStrategyPipeline()`** — canonical orchestration:
  DeckPlan → resolveSlideIntent → selectStrategy → generateStrategyInput → SlideSpec
  - Uses `DeterministicStrategySelector` and `DeterministicStrategyInputGenerator` by default
  - All injection points (registry, selector, generator, slideSpecFactory) are overridable
  - Source content routing: `sourceContentBySlideId` wins over `sourceContentBySlideIndex`
  - Warnings prefixed with slide identity
- **`buildPresentationIrFromDeckPlan()`** — convenience end-to-end helper:
  DeckPlan → runStrategyPipeline → buildPresentationIr → analyzeDeckStrategyQuality (opt-in)
  - Creates minimal `PresentationBrief` when not provided
  - Returns `{ presentation, pipeline, quality?, warnings }`
- **`createSlideSpecFromStrategyPipeline()`** — converts pipeline results to `SlideSpec`:
  - Infers `SlideIntentSchema.type` from `CommunicationIntent` + `ContentKind[]`
  - Infers `LayoutType` from `ContentKind[]`
  - Sets `preferredStrategyId`, `strategyInput`, `strategyInputSource`
  - Empty `content[]` — native path uses strategyInput, not contentBlocks
- **`StrategyQualityGateError`** — typed error thrown when `qualityGate: true` and status is `fail`
- **New types**: `StrategyPipelineInput`, `StrategyPipelineOutput`, `StrategyPipelineSlideResult`,
  `StrategySlideSpecFactoryInput`, `StrategySlideSpecFactory`, `BuildIrFromDeckPlanInput`,
  `BuildIrFromDeckPlanOutput`
- **Core exports**: all pipeline types and functions exported from index.ts
- **19 new tests** (strategy-pipeline.test.ts):
  - runStrategyPipeline: 3-slide deck, preferredStrategyId/strategyInput presence,
    resolved intent fields, varied content kinds
  - buildPresentationIrFromDeckPlan: IR build, native mode, pipeline trace,
    qualityDiagnostics on/off
  - sourceContent routing: id-based vs index-based
  - Quality gate: error class shape, no-throw when disabled
  - createSlideSpecFromStrategyPipeline: field mapping, title fallback
  - No legacy path: empty content, strategyInput present, full build without contentBlocks

### Fixed — deck-forge/core Phase 8G-fix: Tighten quality gate severity

- **empty-slide** penalty increased from -25 to -40; any empty slide now forces deck status `fail`
- **minSlideScore** threshold is now used: `slideScore < minSlideScore` → deck status `warn`
- **schema-warning** severity escalated to `warning` when text contains "fallback", "invalid", or "placeholder"; otherwise remains `info`
- **CJK text overflow**: already handled via `estimateTextBoxHeight()` + `inferTextLanguage()` — no change needed
- **9 new tests**: empty-slide deck fail, minSlideScore warn/fail boundary, schema-warning escalation (fallback/invalid/normal)

### Added — deck-forge/core Phase 8G: Diagnostics, Quality Gates, and Preview Validation

- **`analyzeSlideStrategyQuality()`** — deterministic slide-level diagnostics:
  - StrategyInput trace checks (native/fallback/invalid/missing)
  - Empty slide detection
  - Missing title detection
  - Missing key message detection
  - Text overflow risk estimation
  - Too many elements (>30 warn, >45 error)
  - Too dense (text length/element count thresholds)
  - Out-of-bounds element detection
  - Overlap risk detection (>30% overlap)
- **`analyzeDeckStrategyQuality()`** — deck-level summary with:
  - Native/fallback/invalid/missing slide counts and ratios
  - Quality gate status: pass / warn / fail
  - Configurable thresholds (minNativeRatio, maxFallbackRatio, etc.)
  - Aggregated issue counts by severity
  - Deck score (average of slide scores)
- **`formatDeckStrategyQualityReport()`** — human-readable report for logs/CLI
- **Slide score**: 0–100 deterministic score with per-issue and per-mode penalties
- **Quality gate rules**:
  - fail: any error, invalidRatio > threshold, score < 60, any slide < 40
  - warn: fallbackRatio high, nativeRatio low, score < 75
  - pass: all clear
- **23 new tests** (strategy-quality-diagnostics.test.ts):
  - Trace diagnostics: native/fallback/invalid/missing
  - Empty slide + missing title
  - Text overflow risk
  - Out-of-bounds + overlap
  - Deck ratios + quality gate (pass/warn/fail)
  - Report formatting
  - Score computation
- **Core exports**: all types and functions exported from index.ts
- Total: 1206 pass, 1 pre-existing fail (unrelated pptx margin)

### Changed — deck-forge/core Phase 8F-cleanup: Remove obsolete legacy strategy plumbing

- **Deprecation markers** — `LayoutContext.blocks`, `LayoutResult` array form,
  `LayoutStrategy.capability`, normalizers barrel, archetype maps all marked
  transitional with `TODO(Phase 8H+)` removal targets
- **ARCHETYPE_TO_PREFERRED_STRATEGY_ID** (index.ts) and
  `ARCHETYPE_TO_STRATEGY_ID` (archetype-bridge.ts) marked transitional bridge
- **Normalizers** (`normalize-kpi-summary`, `normalize-decision-request`)
  barrel marked as transitional fallback-only helpers
- **Ghost file deleted** — `executive-summary-kpi.ts` (dead code, not imported)
  already removed prior to this commit
- **54 new tests** (strategy-input-cleanup.test.ts):
  - Native wins over conflicting contentBlocks (5 representative strategies)
  - Fallback-only contentBlocks path
  - Missing + no fallback (5 strategies)
  - Invalid + fallback → invalid-fallback (5 strategies)
  - Invalid + no fallback → invalid (5 strategies)
  - No placeholder generation in layout strategy source files (28 files)
  - No old strategy IDs in production code (3 assertions)
- Total: 1183 pass, 1 pre-existing fail (unrelated pptx margin)

### Added — deck-forge/core Phase 8F: Complete StrategyInput-native migration

- **All 17 built-in strategies now have StrategyInput-native path** —
  remaining 10 strategies migrated:
  - `kpi-dashboard-with-insight` — metrics + chart (trend) + callout (insight)
  - `decision-request` — callout (decision) + paragraph (context) + options + recommendation
  - `recommendation-comparison` — table (options × criteria) + callout (recommendation)
  - `process-flow-with-impact` — paragraph per step + metric (bottleneck) + callout
  - `implementation-roadmap` — paragraph per milestone (label + phase) + callout
  - `small-multiples-trend` — chart blocks (line) per trend + callout
  - `option-comparison-table` — table (options × criteria) + callout (recommendation)
  - `metric-tile-dashboard` — metric blocks per tile + callout
  - `event-timeline` — paragraph per event (label + date) + callout
  - `two-axis-matrix` — paragraph per item (positioned by x/y) + callout
- **Coverage test** — verifies all 17 built-in strategy IDs are native-capable
- **Invalid input parameterized test** — all 10 newly migrated strategies
  tested for invalid-input graceful handling (mode: "invalid")
- **33 new tests** (strategy-input-phase8f.test.ts): native path for all 10
  strategies, coverage assertion, invalid input across all 10
- Total: 1129 pass, 1 pre-existing fail (unrelated pptx margin)

### Fixed — deck-forge/core Phase 8E-fix: Clarify native layout trace semantics

- **`"invalid-fallback"` mode added** — `StrategyInputMode` now distinguishes
  invalid input that fell back to contentBlocks (`"invalid-fallback"`) from
  invalid input with no usable fallback (`"invalid"`)
- **LayoutResult marked transitional** — `SubFrameAssignment[]` form is
  documented as migration-only; TODO(Phase 8F+) to require rich object form
- **StrategyInput schema invariant tests** — verify that semantic inputs
  contain no rendering keys (x/y/width/height/fill/stroke/fontSize)
- **Comprehensive trace state tests** — 5 new tests covering all mode
  transitions: native, legacy-fallback, invalid-fallback, invalid, missing

### Added — deck-forge/core Phase 8E: StrategyInput-native Layout Path

- **LayoutContext extended** — `strategyInput?: unknown` and
  `strategyInputSource?` fields propagated from `SlideSpec` through
  `buildElements()` into each `LayoutStrategy.layout()` call
- **LayoutResult union type** — strategies may return plain
  `SubFrameAssignment[]` (backward-compatible) or a rich object with
  `{ assignments, syntheticBlocks?, strategyInputMode, strategyInputWarnings? }`
- **`readStrategyInput<T>()`** helper (strategy-input-helpers.ts) — type-safe
  Zod validation returning `{ ok, input?, mode, warnings }` for use inside
  layout strategies
- **`normalizeLayoutResult()`** utility — extracts `SubFrameAssignment[]`
  from either form, used by existing tests to stay backward-compatible
- **7 strategies migrated to native StrategyInput path**:
  - `kpi-card-overview` — metrics + optional callout from `KpiCardOverviewInput`
  - `action-plan-table` — table block from actions array + callout
  - `layered-architecture` — paragraph + bullet_list per layer + callout
  - `data-insight-story` — paragraph for data summary, callouts for insight
  - `two-column-comparison` — left/right paragraph + bullet_list pairs
  - `three-point-summary` — 3 paragraphs from points array
  - `one-message-summary` — callout for message + supporting text
- **Trace/diagnostic fields** — `SlideIR._trace` now includes
  `strategyInputMode`, `strategyInputSource`, `strategyInputWarnings`
- **SlideSpecSchema extended** — `strategyInput` (unknown, optional) and
  `strategyInputSource` enum added
- **16 new tests** (strategy-input-native-layout.test.ts): native path for
  all 7 strategies, legacy fallback, invalid input with warnings

### Fixed — deck-forge/core Phase 8D-fix: Harden StrategyInput

- **JSON Schema conversion via Zod 4 `z.toJSONSchema()`** — centralized in
  `getStrategyInputJsonSchema()` / `getAllStrategyInputJsonSchemas()`; no
  `zod-to-json-schema` dependency needed
- **LLM prompt field renamed** `inputSchema` → `inputJsonSchema`; prompt now
  receives a proper JSON Schema object (type, properties, required, enum,
  minItems/maxItems all preserved)
- **Source semantics clarified** — `"deterministic"` when sourceContent is
  provided, `"fallback"` when generating from keyMessage placeholder only
- **Per-strategy fallback warnings** — 15 strategies emit explicit warning
  when generating placeholder content (e.g. "use LLM StrategyInput
  generation for production-quality content")
- **Typed bridge output** — `StrategyInputAttachedSlideSpec<T>` type
  exported; `applyStrategyInputToSlideSpec()` accepts optional `validate`
  flag that throws on schema mismatch
- **No Zod internals leak into prompts** — tested that `_def`, `_cached`,
  `typeName` are absent from all 17 JSON schemas
- **No rendering keys in prompt schemas** — width/height/fill/stroke/
  fontSize/shape tested absent across all 17 prompt schemas
- **102 new tests** (183 total in strategy-input.test.ts): JSON schema
  conversion (85+), prompt field rename (6), source semantics (4), bridge
  validate (4)

### Added — deck-forge/core Phase 8D: StrategyInput Schemas

- **Input schemas for all 17 built-in strategies** — Zod-validated semantic
  input shapes attached to each StrategyManifest via `inputSchema` field
- **Shared primitives** — `KpiMetric`, `ActionItem`, `Option`,
  `TimelineItem`, `Insight`, `Status`, `Trend`, `Priority` schemas
- **`STRATEGY_INPUT_SCHEMAS`** — map of strategy ID → Zod schema
- **`validateStrategyInput()`** — validates any value against the schema
  for a given strategyId
- **`DeterministicStrategyInputGenerator`** — produces minimal valid
  semantic input for all 17 strategies from `slideIntent.keyMessage`
- **`buildStrategyInputPrompt()`** — LLM prompt builder for StrategyInput
  generation (instruction forbids coordinates/rendering)
- **`validateLlmStrategyInputResponse()`** — delegates to schema validation
- **`applyStrategyInputToSlideSpec()`** — bridge that attaches
  `strategyInput` and `preferredStrategyId` to existing SlideSpec objects
- **81 new tests** — schema coverage (2), per-strategy validation (34),
  deterministic generator (34), LLM prompt (4), LLM response validation (3),
  SlideSpec bridge (3), no rendering keys (17 per-strategy)

### Added — deck-forge/core Phase 8C: Strategy Selector

- **`StrategySelector` interface** — `select(input) → StrategySelection`
  with `strategyId`, `confidence` (low/medium/high), `rationale`,
  `selectedBy` (preferredStrategyId / deterministicSelector / llmSelector /
  fallback), `candidateIds`, `warnings`
- **`DeterministicStrategySelector`** — picks explicit `preferredStrategyId`
  first, otherwise highest-scored candidate; falls back to
  `one-message-summary` when no candidates match; accepts optional
  `{ fallbackStrategyId }` constructor option
- **Selection invariant** — `selection.candidateIds` always includes
  `selection.strategyId`, including for fallback selections
- **Fallback validation** — `selectStrategyForIntent()` warns if fallback
  `strategyId` is not registered in the registry (does not throw)
- **LLM prompt builder** — `buildStrategySelectionPrompt()` produces
  JSON-serializable `{ systemMessage, userMessage, candidates }` for
  external LLM calls (no actual API calls in this module)
- **LLM response validation** — `validateLlmStrategySelectionResponse()`
  ensures `strategyId` is in the candidate set and `rationale` is non-empty
- **`selectStrategyForIntent()`** — convenience API combining
  `findStrategyCandidatesForIntent()` + selector in one call
- **`selectStrategiesForDeck()`** — DeckPlan-level selection; resolves each
  `SlideIntent` with deck defaults, then selects a strategy per slide;
  warnings prefixed with `[slide N]` or `[slide N: <id>]`
- **Slide-spec bridge** — `applyStrategySelectionToSlideSpec()` writes
  `StrategySelection.strategyId` back to `slideSpec.preferredStrategyId`
- **Trace/diagnostics** — `StrategySelectionTrace` record with
  `toStrategySelectionTrace()` builder for observability
- **32 tests** — deterministic selector (10), LLM prompt builder (3),
  response validation (5), selectStrategyForIntent (4),
  selectStrategiesForDeck (6), slide-spec bridge (2), trace (2)

### Changed — deck-forge/core Phase 8B-cleanup: Canonical Type Unification

- **Public API** — `LegacyDeckPlan` / `LegacySlideIntent` removed from
  barrel exports; canonical `DeckPlan` (strategy) and `SlideIntent`
  (strategy) are now the only public plan/intent types
- **`PresentationIR.deckPlan`** — type changed from `LegacyDeckPlan` to
  canonical `DeckPlan`
- **`SlideIR.intent`** — type changed from `LegacySlideIntent` to
  canonical `SlideIntent`
- **Internal pipeline** — old Zod-inferred types renamed to
  `ParsedDeckPlan` / `ParsedSlideIntent` (not exported; used only in
  `spec-generation/` internals)
- **`buildSlideIr()`** — adds `slideSpecIntentToCanonical()` converter
  mapping old `{type, keyMessage, audienceTakeaway}` → canonical
  `{intent, contentKinds, keyMessage, audienceTakeaway}`
- **`DeckPlan`** — added `id?: string` field (used as fallback for
  `PresentationIR.id`)
- **`SlideIntent`** — added `audienceTakeaway?: string` field
- **Test fixtures** — all `makeDeckPlan()` helpers rewritten to produce
  canonical `DeckPlan` shape (`audience`, `genre`, `slides`)

### Fixed — deck-forge/core Phase 8B-cleanup

- **Template layout resolution** — split `LAYOUT_TYPE_TO_KIND` into
  `SPECIAL_LAYOUT_TYPE_TO_LAYOUT_ID` / `GENERIC_LAYOUT_TYPE_TO_LAYOUT_ID`;
  business strategy now takes priority over generic layout types like
  `dashboard`

### Removed — deck-forge/core Phase 8B-cleanup

- **`templates/components/*.json`** — unused auto-generated files removed;
  directory added to `.gitignore` (generated by `synthesizeComponents()`
  which is not called by the current runtime)

---

### Added — deck-forge/core Phase 8A: Strategy Manifest Normalization

- **Strategy module** — new `packages/deck-forge/core/src/strategy/` module
  with `StrategyManifest` type, `builtin-manifests.ts`, and
  `createBuiltinStrategyRegistry()` factory
- **17 English-ized manifests** — all strategy manifests rewritten with
  canonical English `chooseWhen` / `avoidWhen` descriptions (previously
  mixed Japanese/English)
- **5 strategy ID renames** (pattern-based, not audience-based):
  - `executive-summary-kpi` → `kpi-card-overview`
  - `dashboard` → `metric-tile-dashboard`
  - `comparison` → `two-column-comparison`
  - `timeline` → `event-timeline`
  - `matrix` / `matrix-2x2` → `two-axis-matrix`
- **Capability renames** to match new IDs:
  `kpi_card_overview`, `metric_tile_dashboard`, `two_column_comparison`,
  `event_timeline`, `two_axis_matrix`
- **`MINIMAL_TEMPLATE_PROFILE`** — new minimal-default template profile
  used as fallback when no template is explicitly provided to
  `buildPresentationIr()`
- **Strategy manifest tests** — 34 tests covering ID uniqueness, canonical
  English language, specificity (chooseWhen ≠ avoidWhen), and
  boundary definitions

### Changed — deck-forge/core Phase 8A

- **`data-insight-story` contentKinds** — removed `root-cause`, added
  `summary` (now: `["chart", "research-result", "summary"]`)
- **`layered-architecture` capabilities** — added `supportsIcons: true`
  (now: `{ supportsIcons: true, supportsImages: true }`)
- **`ARCHETYPE_TO_PREFERRED_STRATEGY_ID`** — updated mappings:
  `kpi_summary` → `"kpi-card-overview"`, `comparison` → `"two-column-comparison"`
- **`STRATEGY_TO_LAYOUT_ID`** — updated key:
  `"kpi-card-overview"` → `"dashboard-cards"` (was `"executive-summary-kpi"`)
- **`buildPresentationIr()` default** — falls back to
  `MINIMAL_TEMPLATE_PROFILE` when no `templateProfile` is provided
  (was previously `EXECUTIVE_NAVY_TEMPLATE_PROFILE`)
- **Intent-parser prompt** — updated strategy IDs in archetype mapping
  guidance

### Fixed — deck-forge/core Phase 8A

- **Template profile tests** — `buildPresentationIr` trace tests now
  explicitly pass `templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE`
  instead of relying on the (changed) default

### Added — deck-forge Phase 7.8: Archetype + Content Contract + Layout Primitives

- **SlideArchetype** — 11 archetype values (title, kpi_summary, cause_analysis,
  trend_small_multiples, process_with_impact, approval_request, action_plan_table,
  comparison, roadmap, architecture, generic_content) with
  `ARCHETYPE_TO_PREFERRED_STRATEGY_ID` mapping
- **Content Contracts** — 5 archetype-specific contract schemas
  (KpiSummaryContract, ApprovalRequestContract, TrendSmallMultiplesContract,
  ProcessWithImpactContract, CauseAnalysisContract) as Zod discriminated union
- **Contract-to-blocks** — `contentContractToBlocks()` converts structured
  contracts into standard ContentBlock[] for layout strategies
- **Contract validation** — `validateContentContract()` with semantic checks
  (too_many_metrics, missing_cta, too_many_approval_items, etc.)
- **Content normalizers** — `normalizeKpiSummaryContent()` and
  `normalizeDecisionContent()` extract semantic groups (metrics/insight/
  supporting, cta/approvalItems/metrics/supporting)
- **Layout primitives** — 6 composable functions: `layoutMetricRail`,
  `layoutCardGrid`, `layoutBottomCallout`, `layoutSmallMultiplesGrid`,
  `layoutProcessRail`, `layoutSidecarStack`
- **preferredStrategyId** — `selectLayoutStrategy()` respects
  `spec.preferredStrategyId` (or inferred from archetype) with
  selectedBy trace ("preferredStrategyId" | "deterministicSelector" | "fallback")
- **Strategy migrations** — `executive-summary-kpi` and `decision-request`
  rewritten to use normalizers + primitives for overlap-free placement
- **LLM guidance** — intent-parser-bedrock updated with archetype selection
  and contentContract schema documentation
- **Build fix** — element creation loop now iterates over `placedBlocks`
  (contract-generated or raw) instead of always using raw content
- **Normalizer fix** — paragraphs matching approval keywords, and table blocks,
  classified correctly in `normalizeDecisionContent`
- **Diagnostics/trace** — `_trace` extended with archetype, preferredStrategyId,
  selectedBy fields
- **Tests** — 42 new tests (content-contracts, layout-primitives) +
  14 new regression tests (preferredStrategyId, contract integration,
  manufacturing 6-slide fixture)

### Added — deck-forge Phase 7.7-fix2: Asset pruning & decision-request V1 hardening

- **Asset pruning** — image asset generation now requires at least one
  `image` block in slideSpecs; `ASSET_SPECS_SYSTEM` prompt forbids
  decorative images for KPI-heavy business decks; post-generation prune
  removes assets targeting non-image-block slides
- **Decision-request callout classification** — callouts are classified as
  CTA / approval-item / supporting via keyword regex; approval items route
  to `main` slot (grid) instead of `supporting` (prevents overlap)
- **`createApprovalItemFrames()`** — new grid helper: 1→full, 2→vertical
  stack, 3–4→2×2 grid (if width ≥ 400) or vertical, 5+→vertical stack
- **Executive-summary-kpi hardening** — replaced ratio-based vertical split
  with fixed callout band height (90px + gap), giving metric rail more
  stable vertical space
- **`repairSameFrameOverlaps()`** — deterministic LLM-free repair that
  detects elements sharing the same frame and redistributes vertically;
  runs after V1 diagnostics and before the VLM design-review loop;
  operations logged with `source: deterministic-v1-repair`
- **`AssetUsageDiagnostics`** — new type on `DeckStabilizationDiagnostics`
  tracking `totalAssets`, `imageAssetCount`, `imageElementCount`,
  `usedAssetCount`, `unusedAssetCount`, `unusedAssetIds`; logged in V1
  and final diagnostics
- **Data faithfulness: partial breakdown guard** — intent-parser and
  operation-planner prompts now forbid inventing breakdown categories;
  if only one category is given, only that + "その他" is allowed

### Added — deck-forge Phase 7.7-fix: V1 layout stabilization & strategy routing hardening

- **Hotspot logging** — V1 and final diagnostics now emit `hotspotSlides`
  (top 3 non-info severity) with `overlapCount`, `layoutRepairOps`,
  `layoutStrategyId`, and `reasons` for faster root-cause identification
- **`hasProcessSignals()` keyword detector** — detects process content via
  Japanese/English keywords (標準フロー, 工程, 手順, ステップ, workflow,
  `→`×2+) even when `intent.type` is not `"process"`
- **Process strategy priority bump (75 → 85)** — `process-flow-with-impact`
  now wins over table/dashboard strategies on slides with process keywords,
  preventing process diagrams from being absorbed into generic grids
- **Data faithfulness guard** — intent-parser and operation-planner prompts
  now explicitly forbid fabricating numeric breakdowns or trend deltas not
  present in the source material
- **Title-slide deterministic layout** — replaced dynamic `splitVertical`
  with fixed y-positions for subtitle (y=340), tagline (y=440), and footer
  (y=600); enforces center alignment to eliminate reviewer corrections
- **Manufacturing deck regression test** — verifies keyword-based process
  routing and zero overlaps for 標準フロー-themed content
- **Title slide regression test** — verifies no overlaps and center
  paragraph alignment

### Added — deck-forge Phase 7.7: Initial layout repair reduction

- **`createMetricRail()`** — deterministic horizontal KPI rail helper in
  `grid-utils.ts`; 1–4 metrics in a single row, 5+ in a 2-row grid; used by
  `executive-summary-kpi` and `decision-request` strategies to eliminate
  reviewer frame corrections for metric card positioning
- **`createSmallMultiplesGrid()`** — deterministic small-multiples grid
  helper; 2–3 charts in a single row, 4 in 2×2, 5+ via generic grid;
  each chart guaranteed ≥ 280 px wide
- **`createTwoByTwoCards()`** — 2×2 card grid helper for 3–4 initiative
  blocks; 1–2 horizontal, 3–4 in 2×2, 5+ in 2-col × N-row grid
- **`layoutRepairOperationCount` / `visualPolishOperationCount` /
  `contentRewriteOperationCount`** — absolute count fields added to
  `OperationDiagnosticsSummary` alongside existing ratios for easier
  before/after comparison
- **Layout stabilization regression tests** — 5 representative deck
  patterns (Q2 KPI summary, downtime visual insight, monthly small
  multiples, process with impact, approval request) verified for
  zero overlaps and zero out-of-bounds at V1
- **Grid helper unit tests** — 19 tests covering `createMetricRail`,
  `createSmallMultiplesGrid`, and `createTwoByTwoCards`

### Changed

- **`executive-summary-kpi` strategy** — replaced `createCardGrid()` with
  `createMetricRail()` so 3–4 KPI cards are always placed in a horizontal
  rail instead of a 2×2 grid that the reviewer had to flatten
- **`small-multiples-trend` strategy** — replaced `createCardGrid()` with
  `createSmallMultiplesGrid()` so 2–3 charts are deterministically
  placed side-by-side
- **`process-flow-with-impact` strategy** — now uses explicit
  `process` / `impact` / `callout` template slots from
  `process-with-impact` layout; metrics go to `impact` slot, callouts
  to `callout` slot, eliminating overlap between the three regions
- **`decision-request` strategy** — first callout → `cta`, extras →
  `supporting`; 3+ paragraphs split as initiatives into `main` slot
  (2×2 grid) with last paragraph as supporting text; 2 metrics
  placed side-by-side via `createMetricRail()`; prevents cramming all
  paragraphs into the small `supporting` slot

### Fixed — deck-forge Phase 7.6-fix: Decision-request strategy + diagnostics hardening

- **decision-request strategy rewrite** — optimised for `approval-with-kpi-sidecar`
  template layout; uses `cta → main → metrics → supporting` slot order; table
  blocks placed in `main` (no dedicated `table` slot) to avoid fallback; priority
  elevated from 75 → 90 to win over `action-plan-table` on approval slides
- **Expanded decision keyword matching** — added `ask`, `request`, `go/no-go`,
  and Japanese terms `審議`, `意思決定`, `本会議`, `お願いします`, `承認事項`, `施策承認`
- **`operationsWithoutSlideId`** added to `OperationDiagnosticsSummary` — tracks
  operations lacking `slideId` for better diagnostics coverage
- **V1 diagnostics** — runtime now logs `diagnostics` event with
  `diagnosticsPhase: 'v1'` before design-review loop (baseline measurement)
- **`resolveQualityStatus()`** — derives `pass`/`warning`/`fail` from
  stabilization diagnostics; included in runtime success log
- **`json-extraction.ts`** — new LLM output JSON extraction utility
  (`extractJsonText` + `parseJsonFromModelOutput`) handling fenced code
  blocks, array/object slicing, and graceful fallback
- **reviewer-bedrock hardening** — uses `parseJsonFromModelOutput` with
  graceful degradation (returns `[]` on parse failure instead of throwing)
- **Tests**: 8 new decision-request strategy tests (approval-with-kpi-sidecar
  slot routing, Japanese keyword matching, metric/supporting placement),
  4 new `operationsWithoutSlideId` tests, json-extraction test suite

### Added — deck-forge Phase 7.6: Diagnostics-driven Layout Stabilization

- **Phase 7.6A: Operation diagnostics granularity**
  - `OperationRepairCategory` type with 9 categories: `layout_frame`,
    `layout_position`, `layout_size`, `visual_font`, `visual_style`,
    `content_text`, `content_delete`, `content_add`, `unknown`
  - `operationsByRepairCategory` added to `OperationDiagnosticsSummary`
  - `layoutRepairRatio`, `visualPolishRatio`, `contentRewriteRatio` —
    ratio fields for quick triage
  - `topSlidesByOperations` / `topOperationTypes` — sorted descending
  - Classification priority: delete → font → frame → position → size →
    style → add → text → unknown (handles ambiguity: `remove_slide`,
    `fontSize`, `add_border`)
  - 11 new operation diagnostics tests

- **Phase 7.6B: Deck stabilization diagnostics**
  - New `analyzeDeckStabilization()` API in
    `diagnostics/stabilization-diagnostics.ts` — integrates layout +
    operation diagnostics into a single assessment
  - `DeckStabilizationDiagnostics` — `status` (stable / needs_attention /
    unstable), `score` (0–100, deduction-based), `reasons`, `hotspots`,
    `recommendations`
  - `SlideStabilizationHotspot` — per-slide breakdown with operation counts,
    fallback slots, overlap/out-of-bounds, severity
  - `StabilizationRecommendation` — 7 codes: `reduce_layout_repair`,
    `fix_template_slots`, `split_dense_slide`, `add_template_layout`,
    `improve_renderer_variant`, `review_strategy_mapping`, `ready_for_phase_8`
  - 10 new stabilization diagnostics tests

- **Phase 7.6C: Runtime logging integration**
  - `diagnostics` log event after design-review-loop-complete with
    `stabilizationScore`, `stabilizationStatus`, ratios,
    `topSlidesByOperations`, `recommendationCodes`
  - `stabilization-diagnostics.json` uploaded to S3 artifact bundle
  - `stabilizationDiagnosticsS3Uri` added to `DeckForgeArtifact` type

- **Phase 7.6D: approval-with-kpi-sidecar layout**
  - New `approval-with-kpi-sidecar` layout in `executive-navy-v1`
    (22 layouts total) with `title`, `cta`, `main`, `metrics`,
    `supporting`, `footer` slots
  - `decision-request` strategy now maps to `approval-with-kpi-sidecar`
    (was `table-with-cta`)

### Added — deck-forge/core Phase 7.5: Template Layout Profile Expansion

- **12 new TemplateLayoutProfiles** in `executive-navy-v1` (9 → 21 total):
  `content-with-sidebar`, `content-with-callout`, `visual-left-insight-right`,
  `visual-top-insight-bottom`, `dashboard-cards-with-chart`, `table-with-cta`,
  `comparison-two-column`, `roadmap-horizontal`, `process-with-impact`,
  `architecture-layered`, `matrix-with-insight`, `message-focus`
- **5 new `TemplateLayoutKind` values** — `comparison`, `roadmap`,
  `architecture`, `matrix`, `message`
- **7 new `TemplateSlotName` values** — `sidebar`, `milestones`,
  `architecture`, `matrix`, `impact`, `message`, `supporting`
- **`resolveTemplateLayout` mapping updates**
  - Strategy mappings: `kpi-dashboard-with-insight` → `dashboard-cards-with-chart`,
    `data-insight-story` → `visual-left-insight-right`,
    `small-multiples-trend` → `visual-top-insight-bottom`,
    `process-flow-with-impact` → `process-with-impact`,
    `implementation-roadmap` → `roadmap-horizontal`,
    `action-plan-table` / `decision-request` → `table-with-cta`,
    `layered-architecture` → `architecture-layered`
  - Generic layout type entries: `timeline`, `comparison`, `matrix`,
    `diagram_focus`, `text_left_image_right`, `image_left_text_right`
- **Strategy slot preferences** — `process-flow-with-impact` prefers
  `impact` slot; `implementation-roadmap` prefers `milestones` slot
- **4 coverage tests** — no duplicate ids, title+footer on non-blank,
  slot bounds, slot overlap (frameOverlapRatio < 0.08)

### Added — deck-forge/core Phase 7C: Layout Diagnostics / Deploy Readiness / Operation Analysis

- **`diagnostics/layout-diagnostics.ts`** — new module with `analyzeSlideLayout()` and
  `analyzeDeckLayout()` functions; produces per-slide diagnostics (overlap detection,
  out-of-bounds, slot coverage, fallback slots, element count) and deck-level summary
  with `templateLayoutIdUsage`, `templateLayoutKindUsage`, `layoutStrategyUsage`,
  `fallbackSlotUsage`, and `deployReadiness` (`pass` / `warning` / `fail`)
- **`diagnostics/operation-diagnostics.ts`** — new module with `analyzeOperationLog()`
  function; classifies operations into layout repair vs visual polish categories,
  groups by type and slide, and provides fine-grained counters (frame, position,
  size, font, style, text updates)
- **`SlideLayoutDiagnostics`** / **`DeckLayoutDiagnosticsSummary`** /
  **`LayoutDeployReadiness`** / **`OperationDiagnosticsSummary`** types exported
  from core public API
- **8 warning codes** — `missing_template_trace`, `missing_expected_slot`,
  `slot_fallback`, `low_slot_coverage`, `element_overlap`, `element_out_of_bounds`,
  `too_many_elements`, `too_many_fallback_slots`
- **22 unit tests** — layout diagnostics (13 tests: trace, fallback, overlap,
  out-of-bounds, coverage, deploy readiness, golden 6-slide scenario) and
  operation diagnostics (9 tests: classification, grouping, edge cases)

### Added — deck-forge/core Phase 7B: Slot Helper / Diagnostics / Strategy Slot Expansion

- **`slot-utils.ts`** — new module with `resolveSlotFrame()`, `assignmentFromSlot()`,
  `mergeFallbackSlots()` helpers and `SlotResolution` type; replaces ad-hoc
  `ctx.templateSlots.x ?? ctx.templateSlots.y` patterns with tracked resolution
- **`SubFrameAssignment.fallbackSlots`** — new optional field recording which
  template slots a strategy attempted but were missing from the template layout;
  enables Phase 7C+ diagnostics
- **`buildPresentationIr()` trace collection** — `fallbackSlots` from assignments
  are now aggregated into `SlideIR._trace.fallbackSlots`
- **8 business strategies migrated to slot helpers** — executive-summary-kpi,
  kpi-dashboard-with-insight, data-insight-story, small-multiples-trend,
  process-flow-with-impact, implementation-roadmap, action-plan-table,
  decision-request now use `resolveSlotFrame()` / `assignmentFromSlot()`;
  actual slot names (`insight` vs `callout`, `cta` vs `callout`) are recorded
  accurately instead of hard-coded fallback names
- **12 slot-utils unit tests** — `resolveSlotFrame` (5), `assignmentFromSlot` (4),
  `mergeFallbackSlots` (3)
- **4 new trace tests** — fallback collection from assignments, insight slot
  tracing, cta slot tracing, title slot tracking

### Fixed — deck-forge/core Phase 7A-fix: resolveTemplateLayout priority correction

- **`resolveTemplateLayout()` priority reorder** — split `LAYOUT_TYPE_TO_KIND`
  into `SPECIAL_LAYOUT_TYPE_TO_LAYOUT_ID` (title/cover/section) and
  `GENERIC_LAYOUT_TYPE_TO_LAYOUT_ID` (dashboard/table/two_column/etc.); new
  resolution order: special type → business strategy → generic type → fallback.
  Previously, generic types like `dashboard` overrode business strategies like
  `kpi-dashboard-with-insight`.
- **9 new priority tests** covering special-beats-strategy, strategy-beats-generic,
  unknown-strategy-fallback, and no-match-fallback scenarios

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

# Codex Migration

Issue #221 migrates Agentra's Claude Code-oriented harness into a Codex-native
workflow without discarding the existing investment.

## Role Split

Codex is the primary implementation and review agent for Agentra:

- issue-driven implementation;
- architecture-aware coding;
- package-boundary review;
- PR review and CI debugging;
- prompt-guided runtime smoke interpretation.

Claude Code remains useful as a local helper:

- reproducing failures in a developer shell;
- CLI-heavy workflows and log inspection;
- small targeted patches;
- secondary review;
- using the existing Claude skill/reference library when it is helpful.

The migration should preserve behavior and intent, not file-for-file
compatibility with Claude Code concepts.

## Migrated Surfaces

- `AGENTS.md` is the canonical repository guidance for Codex, Claude Code, and
  human contributors.
- `.github/codex/prompts/implement-issue.md` guides issue implementation.
- `.github/codex/prompts/review-pr.md` guides PR review.
- `.github/codex/prompts/fix-ci.md` guides CI failure analysis.
- `.github/codex/prompts/review-architecture.md` guides architecture review.
- `.github/codex/prompts/review-package-boundary.md` guides monorepo boundary
  review.
- `.github/codex/prompts/smoke-runtime.md` guides AgentCore runtime smoke and
  log interpretation.
- `.codex/config.toml` keeps repo-local Codex feature flags and shared MCP
  server definitions.
- `.codex/hooks.json` declares Codex hooks for guardrails and the existing Stop
  quality gate.
- `scripts/agent/codex_guardrails.py` implements dependency-light guardrails
  that can also be exercised outside Codex.
- `docs/development/codex-config.md` documents Codex config, MCP, and local
  environment assumptions.
- `.codex/skills/github-issue-to-pr` and `.codex/skills/github-pr-review-close`
  are retained as small Agentra workflow skills aligned with `AGENTS.md` and the
  Codex prompt files.
- Additional workflow and domain skills under `.codex/skills/` migrate useful
  Everything Claude Code and domain guidance without preserving Claude-only
  execution mechanics.

Existing references remain important:

- `CLAUDE.md` is the historical Claude Code guidance source.
- `.claude/commands/` and `.claude/agents/` contain useful behavior patterns.
- `.claude/rules/` contains Docker, security, testing, workflow, and coding
  style guidance that has been condensed into `AGENTS.md` and Codex prompts.
- `.claude/skills/` remains the historical source for any domain references that
  were not migrated or that need future refresh.
- `docs/dev/live-agentcore-smoke.md` remains the detailed runtime smoke guide.

## Migration Inventory

| Asset | Classification | Result |
|---|---|---|
| `AGENTS.md` | migrate to `AGENTS.md` | Expanded as canonical repo rules. |
| `CLAUDE.md` | migrate to `AGENTS.md` + prompts/docs | Reused for architecture, commands, boundaries, validation, role split. |
| `.claude/commands/plan.md` | migrate to Codex prompt | Folded into `implement-issue.md`. |
| `.claude/commands/code-review.md` | migrate to Codex prompt | Converted into `review-pr.md` behavior. |
| `.claude/commands/build-fix.md` | migrate to Codex prompt | Converted into `fix-ci.md` behavior. |
| `.claude/commands/checkpoint.md` | keep Claude Code-only helper | Too local/checkpoint-specific for Codex v1. |
| `.claude/commands/learn.md` | keep Claude Code-only helper | Useful locally, not first-class Codex workflow. |
| `.claude/contexts/*.md` | migrate to prompts/docs | Reused as dev/review/research behavior. |
| `.claude/agents/code-reviewer.md` | migrate to Codex prompts | Confidence-based review reused in `review-pr.md`. |
| `.claude/agents/architect.md` | migrate to Codex prompt | Converted into `review-architecture.md`. |
| `.claude/agents/code-explorer.md` | migrate to Codex prompt/docs | Exploration-first behavior reused in `implement-issue.md`. |
| `.claude/agents/e2e-runner.md` | migrate to Codex skill | Converted into `agentra-e2e-testing` behavior. |
| `.claude/rules/docker.md` | migrate to `AGENTS.md` | Docker/pnpm workspace constraints preserved. |
| `.claude/rules/security.md` | migrate to `AGENTS.md` + prompts | Secrets and trust-boundary guidance preserved. |
| `.claude/rules/testing.md` | migrate to `AGENTS.md` | Adapted to risk-scaled validation. |
| `.claude/rules/git-workflow.md` | migrate to `AGENTS.md` + prompts | Commit/PR expectations preserved. |
| `.claude/rules/coding-style.md` | migrate to `AGENTS.md` | Immutability, validation, and error handling preserved. |
| `.claude/rules/development-workflow.md` | migrate to `AGENTS.md` + prompts | Planning/review flow preserved without Claude-agent mandates. |
| `.claude/rules/aws.md` | migrate to `AGENTS.md` + `smoke-runtime.md` | IaC-first and no accidental deploy guidance preserved. |
| `.claude/rules/performance.md` | needs human decision | Claude model guidance was not ported into Codex rules. |
| `.claude/rules/agents.md` | deprecate/delete later | Claude subagent orchestration is not Codex-native repo guidance. |
| `.claude/skills/github-*` | partially migrated already | Existing `.codex/skills` kept and aligned with Agentra prompts. |
| `.claude/skills/domain skills` | migrate selected to Codex skills | High-value AWS, Bedrock, Hono, API, React, testing, vector, secrets, and web guidelines skills migrated. |
| `.claude/scripts/hooks/*` | migrate to shared script | Guardrail intent ported into `scripts/agent/codex_guardrails.py`. |
| `.mcp.json` | migrate to Codex config | Reusable MCP definitions ported without literal secrets. |
| `.codex/config.toml` | Phase 3/4 | Keeps feature flags and MCP; inline hooks moved to `.codex/hooks.json`. |
| `.codex/hooks/stop_quality_gate.py` | Phase 4 | Existing Stop quality gate preserved and invoked from `.codex/hooks.json`. |
| `docs/dev/live-agentcore-smoke.md` | migrate to Codex prompt | Source for `smoke-runtime.md`. |
| `justfile` AgentCore recipes | migrate to prompt/docs | Referenced for smoke/log workflows. |
| package scripts / CI workflows | migrate to `AGENTS.md` validation | Used as validation source of truth. |

## PR Phases

1. Phase 1: expand `AGENTS.md` as canonical guidance.
2. Phase 2: add Codex prompts and this migration document.
3. Phase 3: refine `.codex/config.toml`, port safe MCP definitions, document
   MCP/env assumptions, and avoid new guardrail scripts.
4. Phase 4: add Codex hooks, shared guardrail scripts, and selected workflow
   and domain skills.

Phase 4 uses `.codex/hooks.json` as the single hook declaration surface for this
repo layer. `.codex/config.toml` remains focused on feature flags and MCP.

## Validation Expectations

For documentation and prompt changes:

```bash
pnpm biome check AGENTS.md .github/codex/prompts docs/development/codex-migration.md
```

For config, guardrail, or skill changes, run:

```bash
python3 scripts/agent/codex_guardrails.py --self-test
pnpm biome check .
pnpm typecheck
pnpm test
```

Live AgentCore smoke commands should remain manual unless the user explicitly
requests them and provides the required AWS environment.

## Follow-Ups

- Whether any MCP servers added in Phase 3 should be removed or narrowed after
  real-world use.
- Whether any migrated domain skill should be slimmed down or refreshed against
  current vendor docs after real-world use.
- Which guardrail scripts should also run in CI versus only during Codex work.

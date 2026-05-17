---
name: agentra-architecture-review
description: Review Agentra changes for architecture fit, runtime responsibility boundaries, workspace ownership, deployment safety, and long-term maintainability.
---

# Agentra Architecture Review

Use this skill for design review, implementation review, or PR review where
architecture and boundaries matter more than line-level style.

## Sources of truth

- `AGENTS.md`
- `.github/codex/prompts/review-architecture.md`
- `.github/codex/prompts/review-package-boundary.md`

## Review focus

- Frontend owns UI and browser-facing behavior.
- Backend owns auth, app-user resolution, history, and SSE transport.
- AgentCore runtime owns orchestration, tools, RAG, and model calls.
- Presentation runtime/package owns deck generation and sandbox behavior.
- `packages/shared` owns OpenAPI contracts and generated/shared types.
- `infra/cdk` owns infrastructure.

## Workflow

1. Map changed files to owning workspaces.
2. Trace changed data flow across frontend, backend, runtime, shared, and infra.
3. Flag responsibility leaks, hidden coupling, direct infrastructure state
   changes, and package-boundary drift.
4. Prefer concrete findings with file/line evidence.

## Output

Use `Accept`, `Accept with changes`, or `Block`, followed by findings, boundary
notes, and recommended changes.

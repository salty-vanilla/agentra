---
name: agentra-runtime-smoke
description: Guide or interpret Agentra AgentCore runtime smoke tests and logs. Use for live runtime smoke checks, AgentCore logs, RAG/tool diagnostics, trace IDs, and runtime session debugging.
---

# Agentra Runtime Smoke

Use this skill for manual runtime validation and log interpretation. It is not a
deployment automation skill.

## Sources of truth

- `AGENTS.md`
- `.github/codex/prompts/smoke-runtime.md`
- `docs/dev/live-agentcore-smoke.md`
- `justfile`
- `apps/agentcore-runtime-ts/scripts/*smoke*`
- `apps/agentcore-runtime-ts/scripts/agentcore-logs.ts`

## Safety

- Do not run production deploy commands.
- Do not mutate AWS infrastructure.
- Do not print secrets or real `.env.local` values.
- Live smoke tests require explicit user request and local AWS environment.

## Workflow

1. Identify the symptom: UI/SSE, runtime timeout, missing tool observation,
   missing citation, or slide artifact failure.
2. Pick the narrow smoke command from the documented package scripts.
3. Capture `traceId`, runtime session ID, tool observations, elapsed time, and
   fallback/error markers.
4. Inspect logs with existing just recipes or runtime log scripts when the local
   AWS environment is ready.
5. Separate backend transport issues from AgentCore runtime, IAM, RAG, or tool
   issues.

## Output

Report the smoke command, environment assumptions, trace identifiers, observed
failure class, likely owner, and next diagnostic step.

# Smoke Runtime

Use this prompt when Codex is asked to guide or interpret Agentra runtime smoke
tests and logs.

## Intended Use

Validate deployed or local runtime behavior without adding production deployment
automation. These checks are manual diagnostics for separating UI/BFF transport
issues from AgentCore runtime, RAG, tool, or IAM issues.

## Safety Rules

- Do not run production deployment commands unless the user explicitly asks.
- Do not mutate AWS infrastructure from this prompt.
- Do not print secrets or real `.env.local` values.
- Prefer documented smoke and log commands from existing scripts and `justfile`.
- Live smoke tests require credentials and environment variables; ask for
  confirmation before running them if they are not already requested.

## Existing References

- `docs/dev/live-agentcore-smoke.md`
- `apps/agentcore-runtime-ts/scripts/smoke-agentcore-chat.ts`
- `apps/agentcore-runtime-ts/scripts/smoke-agentcore-manufacturing-line.ts`
- `apps/agentcore-runtime-ts/scripts/smoke-agentcore-web-research.ts`
- `apps/agentcore-runtime-ts/scripts/smoke-agentcore-slide.ts`
- `apps/agentcore-runtime-ts/scripts/agentcore-logs.ts`
- `justfile` AgentCore smoke and log recipes

## Common Commands

Root package scripts:

```bash
pnpm smoke:agentcore:chat
pnpm smoke:agentcore:mfg
pnpm smoke:agentcore:research
pnpm smoke:agentcore:slide
```

Workspace-filtered equivalents:

```bash
pnpm --filter @agentra/agentcore-runtime-ts smoke:chat
pnpm --filter @agentra/agentcore-runtime-ts smoke:mfg
pnpm --filter @agentra/agentcore-runtime-ts smoke:research
pnpm --filter @agentra/agentcore-runtime-ts smoke:slide
```

Strict-mode examples:

```bash
pnpm smoke:agentcore:research -- --strict
pnpm smoke:agentcore:mfg -- --strict
pnpm smoke:agentcore:slide -- --strict
```

## Diagnostic Flow

1. Identify the symptom.
   - UI or `/chat` SSE failure.
   - Runtime timeout or stream error.
   - Missing citations/tool observations.
   - Slide artifact not produced.

2. Pick the narrow smoke.
   - Chat path: `smoke:agentcore:chat`.
   - Manufacturing RAG/tools: `smoke:agentcore:mfg -- --strict`.
   - Web research: `smoke:agentcore:research -- --strict`.
   - Slide generation: `smoke:agentcore:slide -- --strict`.

3. Capture correlation data.
   - Record `traceId`, `runtimeSessionId`, elapsed time, tools observed, and
     fallback/error patterns.

4. Inspect logs.
   - Use `just agentcore-logs`, `just agentcore-errors`, or
     `just agentcore-logs-trace` when the environment is configured.
   - Match smoke output to CloudWatch logs by `traceId`.

5. Interpret the layer.
   - Smoke succeeds but UI fails: likely API Gateway, Lambda Web Adapter, BFF, or
     frontend transport.
   - Smoke fails: likely runtime, tool, KB, IAM, model, or third-party secret
     configuration.

## Output Format

```markdown
## Smoke Summary
- Command:
- Environment assumptions:
- Trace/session IDs:
- Result:

## Interpretation
- Likely layer:
- Evidence:

## Next Action
- Narrow follow-up command or file area:
```


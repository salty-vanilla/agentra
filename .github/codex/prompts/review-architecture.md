# Review Architecture

Use this prompt when Codex is asked to review an Agentra design, PR, or proposed
implementation for architecture fit.

## Intended Use

Check whether a change preserves Agentra's intended responsibility boundaries,
data flow, deployment model, and long-term maintainability.

## Architecture Baseline

- Frontend: Next.js chat UI, browser state, user interactions, API calls.
- Backend: Hono BFF, auth/app-user resolution, thread/message persistence,
  AgentCore invocation, SSE transport, UI-oriented response shaping.
- AgentCore runtime: agent orchestration, tool selection, KB/structured RAG,
  model calls, runtime session behavior.
- Presentation runtime/package: deck generation, presentation assets, sandbox
  runtime behavior, artifact upload.
- `packages/shared`: OpenAPI schema and generated/shared types.
- `packages/agent-tools`: runtime-agnostic tool primitives.
- `infra/cdk`: AWS infrastructure definitions.

## Review Checklist

- Does the change keep responsibilities in the owning layer?
- Does data flow through established interfaces instead of reaching across
  runtime boundaries?
- Are shared API/type changes made in `packages/shared` and propagated through
  generated outputs?
- Does the design avoid coupling frontend behavior directly to AgentCore internals?
- Does the backend remain a thin transport/auth/history layer rather than an
  agent orchestration engine?
- Does infrastructure stay in CDK instead of ad hoc AWS CLI state changes?
- Are secrets and stage-specific values passed through documented env vars or
  Secrets Manager?
- Are Docker and workspace packaging constraints preserved?
- Is the solution simpler than adding a new abstraction, dependency, or package?

## Output Format

```markdown
## Architecture Verdict
Accept / Accept with changes / Block

## Findings
- [Severity] File or design area: issue and consequence

## Boundary Notes
- Frontend:
- Backend:
- Runtime:
- Shared:
- Infra:

## Recommended Changes
```


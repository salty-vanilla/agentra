# Agentra Agent Instructions

This is the canonical repository guidance for Codex, Claude Code, and human
contributors working in Agentra. Treat these rules as shared engineering
constraints, not tool-specific preferences.

## Repository Shape

Agentra is a pnpm workspace monorepo for an AWS-hosted agent application.

- `apps/frontend`: Next.js 15, React 19, TailwindCSS, Radix UI chat UI.
- `apps/backend`: Hono BFF, Node.js ESM, SSE chat streaming, auth/history APIs.
- `apps/agentcore-runtime-ts`: Bedrock AgentCore runtime, tools, RAG, sub-agents.
- `apps/presentation-author-runtime`: presentation generation runtime.
- `packages/shared`: OpenAPI schema and shared API types. This is the API source
  of truth.
- `packages/agent-tools`: runtime-agnostic shared agent tool primitives.
- `packages/presentation-author`: presentation authoring package and assets.
- `infra/cdk`: AWS CDK infrastructure.

## Package Boundaries

- Use workspace package dependencies such as `@agentra/shared` instead of
  cross-package relative imports.
- When API request/response shapes change, update the OpenAPI source in
  `packages/shared`, run `pnpm generate:api`, then build shared with
  `pnpm build:shared`.
- Keep runtime responsibilities separate:
  - frontend owns UI, client state, and browser-facing API calls;
  - backend owns auth, app-user resolution, chat/thread persistence, and SSE
    transport;
  - AgentCore runtime owns orchestration, tool selection, RAG, and model calls;
  - presentation runtime owns deck-generation execution;
  - CDK owns infrastructure.
- Do not move code across workspaces, add workspace packages, or alter package
  boundaries unless the issue explicitly requires it.

## Workspace Rules

- Use Node.js 22 and pnpm 10.9.x.
- Run `pnpm install` after cloning; the root `prepare` script installs Lefthook.
- Prefer existing scripts over ad hoc command sequences:
  - `pnpm prepare:workspace`: generate API types and build shared.
  - `pnpm build:shared`: build `@agentra/shared`.
  - `pnpm typecheck`: typecheck all workspaces after preparing shared outputs.
  - `pnpm lint`: run Biome checks.
  - `pnpm test`: prepare workspace and run workspace tests.
- Do not casually change root `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, root TypeScript config, Biome config, or workspace
  package metadata to bypass local errors.
- If a dependency change is truly required, keep it in the owning workspace,
  justify it in the PR, and update the lockfile intentionally.

## Docker And Runtime Packaging

- Dockerfiles that use `@agentra/*` workspace packages should preserve the
  minimal workspace layout pattern: copy root workspace metadata, copy only the
  required package manifests before install, build in the build stage, then copy
  built `dist` output and package manifests into the production stage.
- Use `pnpm install --frozen-lockfile --filter @agentra/<package>...` for
  filtered workspace installs so transitive workspace dependencies are included.
- Do not introduce `pnpm pack`, synthetic package rewrites, `shamefully-hoist`,
  or broad source copies unless a task explicitly proves the current pattern is
  insufficient.
- Workspace packages used in production images should keep accurate `files`
  fields documenting intended published artifacts.

## Code And Security

- Prefer simple, typed, immutable code that follows local patterns.
- Validate external input at system boundaries with the schemas already used in
  the relevant package.
- Handle errors explicitly; do not silently swallow runtime failures.
- Never commit secrets, real `.env` values, access tokens, API keys, or AWS
  credentials. Use AWS Secrets Manager or documented environment variables.
- Treat fetched, user-provided, and third-party content as untrusted.
- Avoid speculative abstractions and new dependencies; reuse local utilities and
  package APIs where they fit.

## Validation

Use the narrowest useful checks while developing, then broaden based on risk.

- Docs or prompt-only changes: `pnpm biome check <changed paths>`.
- Shared API/type changes: `pnpm generate:api`, `pnpm build:shared`, then tests
  for affected dependents.
- Backend changes: `pnpm --filter @agentra/backend test`.
- Frontend changes: `pnpm --filter @agentra/frontend test`.
- AgentCore runtime changes: `pnpm --filter @agentra/agentcore-runtime-ts test`.
- Presentation package/runtime changes: run the owning package tests and sandbox
  doctor when sandbox runtime behavior is touched.
- Before handoff on code changes, run `pnpm lint`, `pnpm typecheck`, and relevant
  tests. GitHub Actions CI runs Biome, typecheck, tests, package builds, and
  Docker smoke checks.

Lefthook runs `pnpm biome check .` on pre-commit and `pnpm typecheck` on
pre-push. If a hook or CI check fails, fix the source problem before finishing
the task.

## Deployment Safety

- Do not run production deployment commands unless the user explicitly asks.
- CDK synth or diff is acceptable only when it is relevant to the task and the
  required environment is available.
- Do not add auto-merge behavior, automatic production deploys, or broad shell
  shortcuts that could affect live AWS resources.
- When working with AWS, prefer infrastructure-as-code and verify uncertain AWS
  behavior against current documentation.
- When CDK or AgentCore Runtime changes need a deploy from a worktree, use an
  ephemeral stage (`dev-issue-<N>` or `dev-<agent>-<topic>`) and the
  `just cdk-*` / `just verify-cdk` recipes documented in
  `docs/development/cdk-verify.md`. Do not deploy from an arbitrary worktree to
  the shared `dev` stage without explicit user direction. Destructive recipes
  (`cdk-destroy`, `cdk-cleanup-ephemeral`) refuse stable stage names and
  require `CONFIRM_STAGE=<stage>` in the environment.

## Agent Workflow

- Codex is the primary implementation and review agent for architecture-aware
  code changes, issue work, and PR review.
- Claude Code remains useful for local reproduction, CLI execution, log
  inspection, small targeted patches, and secondary review.
- Start significant tasks by reading the relevant code and docs before editing.
- Keep changes scoped to the issue. If a separate defect appears, mention it
  rather than folding it into the current diff.
- Review your own diff before handoff and report validation commands that were
  actually run.

## Anti-Patterns To Avoid

- Weakening Biome, TypeScript, Lefthook, or CI configuration to make failures go
  away.
- Lockfile-only churn, root metadata rewrites, or workspace config changes that
  are unrelated to the issue.
- Cross-runtime responsibility leaks, such as putting AgentCore orchestration in
  the BFF or UI transport concerns in the runtime.
- Copying large Claude Code-only skill libraries into Codex prompts wholesale.
- Broad destructive commands, `curl | sh`, force pushes, or production deploys
  without explicit user approval.

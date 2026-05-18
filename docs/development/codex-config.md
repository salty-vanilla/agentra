# Codex Project Configuration

This document describes Agentra's Codex configuration posture for Issues #221
and #230.

## Configuration Posture

Agentra keeps repo-local Codex configuration portable and credential-free. The
committed `.codex/config.toml` should contain shared project behavior and MCP
definitions that are useful to every contributor, while all secret values remain
in local environment variables.

Repo config may include:

- project-local Codex feature flags;
- MCP server definitions that use public endpoints, `npx`/`uvx` launchers, or
  environment variable names for credentials;
- repo-owned hooks that run local validation and guardrails;
- comments explaining safe operating assumptions.

Repo config must not include:

- literal personal access tokens, API keys, or AWS credentials;
- personal plugin state or user-local paths;
- production deployment defaults;
- broad approval, sandbox, or shell policy keys that have not been verified for
  the current Codex runtime.

Personal Codex plugins and environment overrides belong in the user-level Codex
config or local environment files. Those files must stay out of git.

## Current Repo Config

`.codex/config.toml` currently defines shared MCP servers and enables Codex
hooks. Hook declarations live in `.codex/hooks.json` instead of inline TOML so
the repo has one hook surface per Codex config layer.

The Stop hook is now configurable by environment:

- `AGENTRA_STOP_QUALITY_GATE=off` is the default local posture
- `AGENTRA_STOP_QUALITY_GATE=changed` runs changed-file Biome checks and
  guardrail self-tests when guardrail files changed
- `AGENTRA_STOP_QUALITY_GATE=full` preserves full `pnpm typecheck` and
  `pnpm biome check .`

The Stop hook implementation lives at `.codex/hooks/stop_quality_gate.py`.
Additional policy guardrails live in `scripts/agent/codex_guardrails.py`.

MCP command servers assume `npx` and `uvx` are available on `PATH`. `npx` is
available through the Node.js toolchain, and Devbox provides `uv` for `uvx`.
Outside Devbox, install `uv` before using the AWS MCP server.

Most command MCP servers are version-pinned in `.codex/config.toml`. The AWS MCP
proxy keeps the existing `.mcp.json` behavior and uses `mcp-proxy-for-aws@latest`
because the proxy tracks a remote AWS MCP endpoint. Devbox still pins the `uvx`
runtime itself through `devbox.lock`; revisit the proxy package version when AWS
publishes a stable pinning recommendation.

## Local Environment Variables

Use `.env.example` as the source of truth for local environment names. Copy it to
`.env.local` and keep real values uncommitted.

Common Codex-related variables:

| Variable | Use | Commit real value? |
|---|---|---|
| `AGENTRA_AWS_PROFILE` | Local `justfile` AWS profile selection | No |
| `AGENTRA_STAGE` | Local stage selection, normally `dev` | No |
| `AGENTRA_GUARDRAIL_MODE` | Guardrail strictness: `relaxed`/`local`/`strict` | No |
| `AGENTRA_STOP_QUALITY_GATE` | Stop hook mode: `off`/`changed`/`full` | No |
| `AWS_REGION` | AWS SDK and CLI region | No |
| `AGENTCORE_RUNTIME_ARN` | Manual AgentCore smoke scripts | No |
| `GITHUB_PAT` | GitHub MCP bearer token source | No |

Deployment-only variables must also stay local:

- `THIRD_PARTY_API_KEY_SECRET_ARN`
- `AMPLIFY_GITHUB_PAT`
- `AMPLIFY_GITHUB_REPOSITORY`
- `AMPLIFY_GITHUB_BRANCH`
- `AMPLIFY_URL`

Codex should not run production deployment commands unless the user explicitly
asks for that action in the current task.

## MCP Servers

Phase 3 ports the reusable `.mcp.json` MCP inventory into `.codex/config.toml`
using Codex-native TOML syntax.

| Server | Transport | Credential posture | Use |
|---|---|---|---|
| `github` | HTTP | `GITHUB_PAT` env var | GitHub MCP fallback when plugin/`gh` are not enough |
| `context7` | `npx` stdio | none in repo | Current framework/library docs |
| `exa` | HTTP | none in repo | Broader research when primary docs are insufficient |
| `memory` | `npx` stdio | none in repo | Session-persistent memory when explicitly useful |
| `playwright` | `npx` stdio | none in repo | Browser automation and E2E inspection |
| `sequential-thinking` | `npx` stdio | none in repo | Structured reasoning workflows |
| `aws-mcp` | `uvx` stdio | local AWS env/profile only | Sandboxed AWS MCP proxy |
| `awsknowledge` | HTTP | none in repo | AWS documentation search |
| `hono-docs` | HTTP | none in repo | Hono documentation |

Recommended Codex posture:

- Prefer the GitHub plugin and authenticated `gh` CLI for normal GitHub issue
  and PR work; use GitHub MCP as a fallback or when a workflow benefits from MCP
  tool shape.
- Use Context7 or official docs tooling for current library/framework
  documentation when available.
- Use Playwright tooling only when a task needs browser automation or E2E
  inspection.
- Use AWS documentation/search tooling for read-only AWS reference checks.
- Keep AWS CLI, AWS MCP, and live smoke operations explicit, local, and
  user-approved.
- Do not commit MCP tokens, personal server URLs, or machine-specific paths.

## Codex Skills

Phase 4 migrates valuable Everything Claude Code and domain skills into
repo-local Codex skills while avoiding Claude-specific execution mechanics.

Repo-local Codex skills:

| Skill | Role |
|---|---|
| `.codex/skills/github-issue-to-pr` | Issue implementation through PR creation, aligned with `AGENTS.md` and Codex prompts |
| `.codex/skills/github-pr-review-close` | PR review, safe merge, issue close, and local `main` refresh |
| `.codex/skills/github-fix-ci` | GitHub Actions and local quality gate diagnosis |
| `.codex/skills/github-address-comments` | PR review comment handling |
| `.codex/skills/agentra-runtime-smoke` | AgentCore smoke and log interpretation |
| `.codex/skills/agentra-architecture-review` | Runtime responsibility and package-boundary review |
| `.codex/skills/agentra-e2e-testing` | Browser-level Agentra journey validation |

Selected domain skills are also available under `.codex/skills/` for AWS,
Bedrock, Hono, API design, React, composition, TDD, vectors, secrets, and web
interface review work.

These skills should stay small and refer to:

- `AGENTS.md` for canonical repository constraints;
- `.github/codex/prompts/*` for detailed prompt workflows;
- this document for Codex config and MCP assumptions.

When a domain skill contains version-sensitive vendor guidance, prefer the
configured MCP documentation servers or current official docs before relying on
static reference files.

## Hooks And Guardrails

`.codex/hooks.json` defines the repo's Codex hooks:

- `PreToolUse`: resolves `AGENTRA_GUARDRAIL_MODE`, blocks hard-safety commands
  and real secrets in all modes, and only keeps dependency/config/deploy
  strictness in `strict`.
- `PermissionRequest`: applies the same high-risk command and secret checks to
  approval requests.
- `PostToolUse`: stays broad in `strict`, but suppresses routine local-dev noise
  in `relaxed` and warns only for targeted cases such as workflow
  trigger/permission edits.
- `Stop`: resolves `AGENTRA_STOP_QUALITY_GATE` and defaults to `off` locally.

Guardrails focus on preventing:

- real secret introduction and private key material;
- destructive git/filesystem/cloud commands;
- production-like deploys without explicit user intent;
- accidental workflow permission/trigger changes in relaxed mode;
- dependency/config/deploy bypasses when strict mode is enabled.

These hooks are guardrails, not a complete security boundary. They should reduce
common agent mistakes while preserving normal Agentra development. The default
local posture is intentionally relaxed: let the agent implement freely, keep the
hard safety boundaries, and move most quality enforcement to CI and review. If a
guardrail blocks a legitimate task, narrow the change or ask the user for an
explicit decision rather than bypassing the hook silently.

# Preview Stage Guardrail Library

Standalone TypeScript utilities for validating and resolving preview environment configuration. No AWS SDK or CDK dependencies.

## Allowed Stage Patterns

| Pattern | Regex | Example |
|---------|-------|---------|
| Pull request | `^pr-[0-9]+$` | `pr-307` |
| Sandbox | `^sandbox-[a-z0-9-]+-[0-9]{12}$` | `sandbox-nakatsuka-202605282130` |
| Local | `^local-[a-z0-9-]+-[a-f0-9]{7,12}$` | `local-nakatsuka-a1b2c3d` |

## Forbidden Stage Names

The following names are rejected regardless of case: `prod`, `production`, `staging`, `stage`, `demo`, `dev`, `main`, `master`, `default`, `shared`.

## Preview Profiles

| Profile | Scope |
|---------|-------|
| `minimal-api` (default) | BFF/API + minimal data/auth/artifact resources |
| `backend-ai` | `minimal-api` + AgentCore runtime integration |
| `full` | `backend-ai` + frontend hosting if practical |

## API

```ts
import {
  validatePreviewStage,
  isPreviewStage,
  resolvePreviewConfig,
} from './preview-stage.js';

// Throws on invalid stage
validatePreviewStage('pr-307');

// Returns boolean
isPreviewStage('prod'); // false

// Returns full config with tags and stackPrefix
const config = resolvePreviewConfig({
  stage: 'pr-307',
  profile: 'minimal-api',
  ttlHours: 8,
  owner: 'nakatsuka',
  source: 'github-actions',
});
// config.stackPrefix === 'AgentraPreview-pr-307'
// config.tags.EnvironmentType === 'preview'
```

## TTL Policy

- Minimum: 1 hour
- Maximum: 24 hours
- Default: 8 hours

## Future

This library lives in `scripts/preview/` for now. If CDK layer code (issue #315) or a preview CLI both need to import it, it may be promoted to a dedicated pnpm workspace package (e.g. `packages/preview-config`) to make cross-workspace imports stable and explicit.

## Running Tests

```bash
pnpm test:preview       # run unit tests
pnpm typecheck:preview  # TypeScript type check
pnpm exec biome check scripts/preview/  # lint
```

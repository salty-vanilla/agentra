# Review Package Boundary

Use this prompt when Codex is asked to review dependency, package, Docker, or
workspace-boundary changes in Agentra.

## Intended Use

Prevent monorepo drift: accidental cross-package imports, missing workspace
dependencies, generated type drift, Docker production-stage breakage, and
unjustified root metadata churn.

## Boundary Rules

- `packages/shared` owns OpenAPI schema and shared API types.
- Workspace packages should import each other through package names such as
  `@agentra/shared`, not relative paths across `apps/`, `packages/`, or `infra/`.
- If a workspace imports another workspace package, its `package.json` must
  declare the dependency.
- Avoid root dependency additions when a dependency belongs to one workspace.
- Preserve `pnpm-workspace.yaml` package boundaries unless the issue explicitly
  requires a new workspace.
- Keep generated files in sync when OpenAPI/shared contracts change.

## Docker-Specific Checks

- Dockerfiles using workspace packages should keep the minimal workspace layout:
  root workspace metadata, relevant package manifests, filtered install with
  `@agentra/<package>...`, build output copied from build stage, and production
  install from package manifests.
- Do not replace the current pattern with `pnpm pack`, broad source copies,
  `shamefully-hoist`, or synthetic package rewrites unless there is a documented
  failing case.
- Workspace package `files` fields should continue to describe intended dist or
  asset outputs.

## Review Workflow

1. List changed package, Docker, workspace, and generated files.
2. Map each import/dependency edge introduced by the change.
3. Confirm owning workspace scripts still apply.
4. Check whether shared contract changes require regeneration and dependent
   tests.
5. Flag lockfile-only or root metadata churn that is not explained by the change.

## Output Format

```markdown
## Boundary Findings
- [P1/P2/P3] path:line - issue, impact, and fix

## Dependency Map
- Workspace A -> Workspace B: declared / missing

## Validation Needed
- Command:
- Reason:
```

If no boundary issue exists, state that explicitly.


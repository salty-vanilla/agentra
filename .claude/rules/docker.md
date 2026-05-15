# Docker & pnpm Workspace

## Workspace Package Integration (CRITICAL)

When Dockerfiles reference workspace packages (`@agentra/*`), they MUST:

1. **Copy package.json during install phase**
   ```dockerfile
   COPY packages/shared/package.json packages/shared/package.json
   COPY packages/agent-tools/package.json packages/agent-tools/package.json
   ```
   This allows pnpm to resolve workspace dependencies during `pnpm install`.

2. **Copy source code before build**
   ```dockerfile
   COPY packages/shared/ packages/shared/
   COPY packages/agent-tools/ packages/agent-tools/
   ```
   Required for TypeScript builds that reference workspace packages.

3. **Replace symlinks with real copies after deploy**
   ```dockerfile
   RUN rm -rf /deploy/node_modules/@agentra && \
       mkdir -p /deploy/node_modules/@agentra && \
       cp -rL packages/shared /deploy/node_modules/@agentra/shared && \
       cp -rL packages/agent-tools /deploy/node_modules/@agentra/agent-tools
   ```
   **Why:** `pnpm deploy --legacy` leaves workspace deps as dangling symlinks that don't persist through the Docker filesystem layers. Real copies ensure correct module resolution at runtime.

## TypeScript Build Cache Management

**Add to .dockerignore:**
```
**/*.tsbuildinfo
```

**Why:** `.tsbuildinfo` files generated on the host OS can cause stale build state in Docker:
- Host's incremental build info doesn't match the Docker image's file structure
- Results in missing `.d.ts` files and `TS5083`/`TS7016` errors
- Clean builds in Docker must regenerate cache from scratch

## Install Filter Syntax

**Correct:**
```dockerfile
RUN pnpm install --frozen-lockfile --filter @agentra/backend...
```

**Why:** The `...` suffix automatically includes all dependencies of the specified package. Do NOT add separate `--filter` flags for workspace dependencies.

## When Workspace Changes

After modifying `pnpm-workspace.yaml`, package.json dependencies, or adding/removing workspace packages:
- [ ] Verify all Dockerfiles include COPY for affected packages
- [ ] Check .dockerignore includes `**/*.tsbuildinfo`
- [ ] Test local build: `pnpm build:shared && pnpm --filter @agentra/backend build`
- [ ] Test Docker build: `docker build -f apps/backend/Dockerfile .`
- [ ] Verify node_modules/@agentra/* contains real files, not symlinks

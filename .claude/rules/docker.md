# Docker & pnpm Workspace

## Workspace Package Integration (CRITICAL)

When Dockerfiles reference workspace packages (`@agentra/*`), they MUST use the **minimal workspace layout** approach for the production stage.

### Pattern: Build stage → Production stage with minimal layout

```dockerfile
# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-slim AS build

WORKDIR /app
RUN npm install -g pnpm@10

# Copy workspace config + only the package.json files needed for install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/my-app/package.json apps/my-app/package.json

# Full install populates pnpm store and builds the dependency graph
RUN pnpm install --frozen-lockfile --filter @agentra/my-app...

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/my-app/ apps/my-app/
RUN pnpm --filter @agentra/shared build && \
    pnpm --filter @agentra/my-app build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:24-slim

WORKDIR /app
RUN npm install -g pnpm@10

# Minimal workspace layout — package.json files only, no source
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/my-app/package.json apps/my-app/package.json

# Built dist from build stage; pnpm workspace symlinks resolve through these
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/my-app/dist apps/my-app/dist

# Production install — pnpm links workspace packages to their local dist dirs
RUN pnpm install --prod --frozen-lockfile --filter @agentra/my-app...

WORKDIR /app/apps/my-app
CMD ["node", "dist/index.js"]
```

**Why this pattern:**
- pnpm workspace symlinks in the production stage correctly hoist all transitive deps
- No `pnpm pack`, tarballs, synthetic package.json rewrites, or `shamefully-hoist` needed
- Node.js module resolution walks up from the file's location to `/app/node_modules/`, so workspace symlinks resolve correctly regardless of WORKDIR

**Why NOT pnpm deploy --legacy or cp -rL:**
- `pnpm deploy --legacy` leaves workspace deps as dangling symlinks that don't resolve transitive deps
- `cp -rL` copies source trees but misses transitive deps (e.g. `setimmediate` for `jszip`)

### Package metadata requirements

Every workspace package that appears in the production stage MUST have a `"files"` field:
- `@agentra/shared`: `"files": ["dist"]`
- `@agentra/agent-tools`: `"files": ["dist"]`
- `@agentra/presentation-author`: `"files": ["dist", "vendor", "templates", "assets"]`

**Why:** Even though the workspace layout doesn't use `pnpm pack`, the `files` field documents intent and prevents accidentally including source in any future tarball operations.

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

## Sandbox Runtime (presentation-author-runtime only)

Packages used only inside the sandbox subprocess (pptxgenjs, jszip, prismjs, mathjax-full) are installed separately in an isolated directory, NOT in the app's `node_modules`.

```dockerfile
# Sandbox runtime stage — npm flat node_modules for easy fs-read allow-listing
FROM node:24-slim AS sandbox-runtime
COPY packages/presentation-author/sandbox-runtime/package.json /opt/presentation-sandbox-runtime/package.json
WORKDIR /opt/presentation-sandbox-runtime
RUN npm install --omit=dev

# In production stage:
COPY --from=sandbox-runtime /opt/presentation-sandbox-runtime /opt/presentation-sandbox-runtime
ENV PRESENTATION_SANDBOX_RUNTIME_DIR=/opt/presentation-sandbox-runtime
```

**Why npm instead of pnpm for sandbox-runtime:**
- npm's flat `node_modules` is simpler to add to `--allow-fs-read` as a single directory path
- pnpm's virtual store with symlinks would require allowing multiple paths

**Local development:** Run `pnpm --filter @agentra/presentation-author sandbox:install` to install the sandbox runtime into `.sandbox-runtime/` for local dogfooding.

## When Workspace Changes

After modifying `pnpm-workspace.yaml`, package.json dependencies, or adding/removing workspace packages:
- [ ] Verify all Dockerfiles include COPY for affected package source and package.json
- [ ] Ensure the `files` field in affected workspace package.json files is correct
- [ ] Check .dockerignore includes `**/*.tsbuildinfo`
- [ ] Run `pnpm install` to update the lockfile
- [ ] Test local build: `pnpm build:shared && pnpm --filter @agentra/backend build`
- [ ] Test Docker build: `docker build -f apps/backend/Dockerfile .`
- [ ] Verify container starts: `docker run --rm <image> node -e "import('./dist/...').then(()=>process.exit(0))"`

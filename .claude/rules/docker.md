# Docker & pnpm Workspace

## Workspace Package Integration (CRITICAL)

When Dockerfiles reference workspace packages (`@agentra/*`), they MUST use the **pack-based approach**:

### Pattern: Build → Pack → Production Install

```dockerfile
# 1. Full workspace install (populates pnpm store for the production install below)
RUN pnpm install --frozen-lockfile

# 2. Build all workspace packages
RUN pnpm --filter @agentra/shared build
RUN pnpm --filter @agentra/my-pkg exec tsc -b --force

# 3. Pack @agentra/shared (package.json must declare "files": ["dist"])
RUN mkdir -p /tarballs && \
    cd packages/shared && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-shared-*.tgz /tarballs/shared.tgz

# 4. For packages that depend on other workspace packages,
#    replace workspace:* → file: before packing
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('packages/my-pkg/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}}fs.writeFileSync('packages/my-pkg/package.json',JSON.stringify(p,null,2));"
RUN cd packages/my-pkg && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-my-pkg-*.tgz /tarballs/my-pkg.tgz

# 5. Build production package.json with file: references to tarballs
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('apps/my-app/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}}delete p.devDependencies;fs.mkdirSync('/deploy',{recursive:true});fs.writeFileSync('/deploy/package.json',JSON.stringify(p,null,2));"

# 6. Production install — pnpm uses the store from step 1 (no network access needed)
WORKDIR /deploy
RUN pnpm install --prefer-offline

# 7. Copy built dist and run smoke tests
RUN cp -r /app/apps/my-app/dist ./dist
RUN node -e "import('@agentra/shared').then(()=>console.log('shared ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})"
```

**Why pnpm pack instead of cp -rL:**
- `pnpm deploy --legacy` leaves workspace deps as dangling symlinks that break transitive dep resolution
- `cp -rL` copies source trees but skips transitive deps (e.g. `setimmediate` for `jszip`)
- Packed tarballs installed via `pnpm install` let pnpm correctly hoist all transitive deps

### Package metadata requirements

Every workspace package used in Docker MUST declare a `files` field:
- `@agentra/shared`: `"files": ["dist"]`
- `@agentra/agent-tools`: `"files": ["dist"]`
- `@agentra/presentation-author`: `"files": ["dist", "vendor", "templates", "assets"]`

**Why:** `pnpm pack` without `files` would include source files and devDependencies, bloating the tarball and production image.

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
- [ ] Verify all Dockerfiles include COPY for affected package source and package.json
- [ ] Ensure the `files` field in affected workspace package.json files is correct
- [ ] Check .dockerignore includes `**/*.tsbuildinfo`
- [ ] Test local build: `pnpm build:shared && pnpm --filter @agentra/backend build`
- [ ] Test Docker build: `docker build -f apps/backend/Dockerfile .`
- [ ] Verify smoke tests pass (no ERR_MODULE_NOT_FOUND in build output)

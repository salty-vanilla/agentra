FROM node:22-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
COPY apps/agentcore-runtime-ts/package.json apps/agentcore-runtime-ts/package.json

# Full install — populates pnpm store
RUN pnpm install --frozen-lockfile --filter @agentra/agentcore-runtime-ts...

# Copy source (tsconfig.base.json copied here so install cache is unaffected by type changes)
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/agent-tools/ packages/agent-tools/
COPY apps/agentcore-runtime-ts/ apps/agentcore-runtime-ts/

# Build agent-tools first (--force ignores stale tsbuildinfo), then runtime
RUN pnpm --filter @agentra/shared build && \
    pnpm --filter @agentra/agent-tools exec tsc -b --force && \
    pnpm --filter @agentra/agentcore-runtime-ts build

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm@10

# Minimal workspace layout — package.json files only, no source
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
COPY apps/agentcore-runtime-ts/package.json apps/agentcore-runtime-ts/package.json

# Built dist from build stage; pnpm workspace symlinks resolve through these directories
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/agent-tools/dist packages/agent-tools/dist
COPY --from=build /app/apps/agentcore-runtime-ts/dist apps/agentcore-runtime-ts/dist

# Production install — pnpm links workspace packages to their local dist directories
RUN pnpm install --prod --frozen-lockfile --filter @agentra/agentcore-runtime-ts...

COPY apps/agentcore-runtime-ts/skills apps/agentcore-runtime-ts/skills

WORKDIR /app/apps/agentcore-runtime-ts
EXPOSE 8080 8000 9000
CMD ["node", "dist/agent.js"]

FROM node:22-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy all workspace package.json files needed for install
COPY packages/agent-tools/package.json packages/agent-tools/package.json
COPY apps/agentcore-runtime-ts/package.json apps/agentcore-runtime-ts/package.json

# Install workspace dependencies
RUN pnpm install --frozen-lockfile --filter @agentra/agentcore-runtime-ts...

# Copy source (tsconfig.base.json copied here so install cache is unaffected by type changes)
COPY tsconfig.base.json ./
COPY packages/agent-tools/ packages/agent-tools/
COPY apps/agentcore-runtime-ts/ apps/agentcore-runtime-ts/

# Build agent-tools first, then runtime
RUN pnpm --filter @agentra/agent-tools exec tsc -b --force && \
    pnpm --filter @agentra/agentcore-runtime-ts build

# Deploy: creates a self-contained directory with all deps
RUN pnpm --filter @agentra/agentcore-runtime-ts deploy --legacy /deploy

# Replace workspace symlink with real copy
RUN rm -rf /deploy/node_modules/@agentra/agent-tools && \
    cp -rL packages/agent-tools /deploy/node_modules/@agentra/agent-tools

FROM node:22-slim

WORKDIR /app
COPY --from=build /deploy ./
COPY apps/agentcore-runtime-ts/skills ./skills

EXPOSE 8080 8000 9000
CMD ["node", "dist/agent.js"]

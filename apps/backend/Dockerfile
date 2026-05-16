FROM --platform=linux/arm64 node:24-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json

# Full install — populates pnpm store
RUN pnpm install --frozen-lockfile --filter @agentra/backend...

# Copy source (tsconfig.base.json copied here so install cache is unaffected by type changes)
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

RUN pnpm --filter @agentra/shared build && \
    pnpm --filter @agentra/backend build

# --- Production stage ---
FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:24-slim

WORKDIR /app

RUN npm install -g pnpm@10

# Minimal workspace layout — package.json files only, no source
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json

# Built dist from build stage; pnpm workspace symlinks resolve through these directories
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist

# Production install — pnpm links workspace packages to their local dist directories
RUN pnpm install --prod --frozen-lockfile --filter @agentra/backend...

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/health
ENV AWS_LWA_INVOKE_MODE=response_stream

WORKDIR /app/apps/backend
EXPOSE 8080
CMD ["node", "dist/lambda.js"]

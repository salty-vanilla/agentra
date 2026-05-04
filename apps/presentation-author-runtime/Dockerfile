FROM node:24-slim AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./

# Copy all workspace package.json files needed for install
COPY packages/presentation-author/package.json packages/presentation-author/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/presentation-author-runtime/package.json apps/presentation-author-runtime/package.json

# Install workspace dependencies
RUN pnpm install --frozen-lockfile --filter @agentra/presentation-author-runtime... --filter @agentra/presentation-author...

# Copy source
COPY packages/presentation-author/ packages/presentation-author/
COPY apps/presentation-author-runtime/ apps/presentation-author-runtime/

# Build presentation-author first (--force to ignore stale tsbuildinfo), then runtime
RUN pnpm --filter @agentra/presentation-author exec tsc -b --force && \
    pnpm --filter @agentra/presentation-author-runtime build

# --- Production stage ---
FROM node:24-slim

# OS dependencies for PPTX rendering and Japanese fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    poppler-utils \
    fontconfig \
    fonts-noto-cjk \
    python3 \
    python3-pip \
    python3-venv \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

# Python venv for presentation-author scripts
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY packages/presentation-author/python/requirements.txt /tmp/presentation-author-requirements.txt
RUN pip install --no-cache-dir -r /tmp/presentation-author-requirements.txt

WORKDIR /app

# Ensure HOME is writable for LibreOffice profile
ENV HOME=/tmp

# Copy the workspace structure from build (preserves pnpm symlinks)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/presentation-author/dist ./packages/presentation-author/dist
COPY --from=build /app/packages/presentation-author/package.json ./packages/presentation-author/package.json
COPY --from=build /app/packages/presentation-author/node_modules ./packages/presentation-author/node_modules
COPY --from=build /app/apps/presentation-author-runtime/dist ./apps/presentation-author-runtime/dist
COPY --from=build /app/apps/presentation-author-runtime/package.json ./apps/presentation-author-runtime/package.json
COPY --from=build /app/apps/presentation-author-runtime/node_modules ./apps/presentation-author-runtime/node_modules

# Copy vendored helpers and scripts (needed at runtime)
COPY packages/presentation-author/vendor/ ./packages/presentation-author/vendor/

WORKDIR /app/apps/presentation-author-runtime

EXPOSE 8080

CMD ["node", "dist/agent.js"]

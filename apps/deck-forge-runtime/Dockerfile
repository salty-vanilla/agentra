FROM mcr.microsoft.com/playwright:v1.59.1-noble AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

# --- dependency layer (cached unless package.json / lockfile change) ---
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/deck-forge-runtime/package.json apps/deck-forge-runtime/tsconfig.json ./apps/deck-forge-runtime/
COPY packages/deck-forge/core/package.json packages/deck-forge/core/tsconfig.json ./packages/deck-forge/core/
COPY packages/deck-forge/runner/package.json packages/deck-forge/runner/tsconfig.json ./packages/deck-forge/runner/
COPY packages/deck-forge/tools/package.json packages/deck-forge/tools/tsconfig.json ./packages/deck-forge/tools/
COPY packages/deck-forge/cli/package.json packages/deck-forge/cli/tsconfig.json ./packages/deck-forge/cli/
COPY packages/deck-forge/adapters/package.json packages/deck-forge/adapters/tsconfig.json ./packages/deck-forge/adapters/
COPY packages/deck-forge/mcp-server/package.json packages/deck-forge/mcp-server/tsconfig.json ./packages/deck-forge/mcp-server/

RUN pnpm install --frozen-lockfile --filter @agentra/deck-forge-runtime...

# --- source layer (only rebuilds when source changes) ---
COPY packages/deck-forge ./packages/deck-forge
COPY apps/deck-forge-runtime/src ./apps/deck-forge-runtime/src

RUN pnpm --filter @agentra/deck-forge-runtime... build

FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# LibreOffice + poppler-utils enable pptx -> pdf -> png rendering used by the
# vision reviewer. fonts-noto-cjk is needed so Japanese text renders correctly
# (otherwise CJK glyphs become tofu boxes in the snapshot).
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libreoffice-impress \
        libreoffice-core \
        poppler-utils \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app

EXPOSE 8080 8000 9000
CMD ["node", "apps/deck-forge-runtime/dist/index.js"]

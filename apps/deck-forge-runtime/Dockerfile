FROM mcr.microsoft.com/playwright:v1.59.1-noble AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/deck-forge-runtime/package.json apps/deck-forge-runtime/tsconfig.json ./apps/deck-forge-runtime/
COPY apps/deck-forge-runtime/src ./apps/deck-forge-runtime/src
COPY packages/deck-forge ./packages/deck-forge

RUN pnpm install --frozen-lockfile --filter @agentra/deck-forge-runtime...
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

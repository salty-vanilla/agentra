FROM node:22-slim AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy relevant packages
COPY packages/presentation-author/package.json packages/presentation-author/package.json
COPY apps/presentation-author-runtime/package.json apps/presentation-author-runtime/package.json

# Install workspace dependencies
RUN pnpm install --frozen-lockfile --filter @agentra/presentation-author-runtime... --filter @agentra/presentation-author...

# Copy source
COPY packages/presentation-author/ packages/presentation-author/
COPY apps/presentation-author-runtime/ apps/presentation-author-runtime/

# Build
RUN pnpm --filter @agentra/presentation-author-runtime build

# --- Production stage ---
FROM node:22-slim

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

# Copy built app and dependencies from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/presentation-author-runtime/dist ./dist
COPY --from=build /app/apps/presentation-author-runtime/package.json ./package.json
COPY --from=build /app/packages/presentation-author/ ./packages/presentation-author/

# Copy vendored helpers and scripts (needed at runtime)
COPY packages/presentation-author/vendor/ ./packages/presentation-author/vendor/

EXPOSE 8080

CMD ["node", "dist/agent.js"]

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

# Deploy: creates a self-contained directory with all deps
RUN pnpm --filter @agentra/presentation-author-runtime deploy --legacy /deploy

# pnpm deploy --legacy leaves workspace deps (@agentra/*) as dangling symlinks.
# Replace with real copy, then let npm resolve transitive deps (pptxgenjs etc.).
RUN rm -rf /deploy/node_modules/@agentra/presentation-author && \
    cp -rL packages/presentation-author /deploy/node_modules/@agentra/presentation-author && \
    cd /deploy/node_modules/@agentra/presentation-author && \
    npm install --omit=dev --ignore-scripts

# --- Python venv stage (runs in parallel with build) ---
FROM python:3.11-slim-bookworm AS python
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY packages/presentation-author/python/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# --- Production stage ---
FROM node:24-slim

# OS dependencies for PPTX rendering and Japanese fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    poppler-utils \
    fontconfig \
    fonts-noto-cjk \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

# Copy Python runtime + venv from python stage (no apt python3 needed)
COPY --from=python /usr/local/bin/python3* /usr/local/bin/
COPY --from=python /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=python /usr/local/lib/libpython3* /usr/local/lib/
COPY --from=python /opt/venv /opt/venv
RUN ldconfig
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app

# Ensure HOME is writable for LibreOffice profile
ENV HOME=/tmp

# Copy the self-contained deploy output (includes node_modules + dist)
COPY --from=build /deploy ./

# Copy skill definitions (SKILL.md files read at runtime by AgentSkills plugin)
COPY apps/presentation-author-runtime/skills/ ./skills/

# Copy vendored helpers and scripts (needed at runtime by @agentra/presentation-author)
COPY packages/presentation-author/vendor/ ./node_modules/@agentra/presentation-author/vendor/

EXPOSE 8080

CMD ["node", "dist/agent.js"]

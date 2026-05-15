FROM node:24-slim AS build

# PA-12: icon provider with runtime SVG→PNG rendering via @resvg/resvg-js

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy workspace package.json files needed for install
COPY packages/shared/package.json packages/shared/package.json
COPY packages/presentation-author/package.json packages/presentation-author/package.json
COPY apps/presentation-author-runtime/package.json apps/presentation-author-runtime/package.json

# Full install — populates pnpm store so the later production install can run offline
RUN pnpm install --frozen-lockfile --filter @agentra/presentation-author-runtime...

# Copy source (tsconfig.base.json copied here so install cache is unaffected by type changes)
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/presentation-author/ packages/presentation-author/
COPY apps/presentation-author-runtime/ apps/presentation-author-runtime/

# Build shared, presentation-author (--force ignores stale tsbuildinfo), then runtime
RUN pnpm --filter @agentra/shared build && \
    pnpm --filter @agentra/presentation-author exec tsc -b --force && \
    pnpm --filter @agentra/presentation-author-runtime build

# Pack @agentra/shared — files field (["dist"]) ensures only built output is included
RUN mkdir -p /tarballs && \
    cd packages/shared && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-shared-*.tgz /tarballs/shared.tgz

# Replace workspace:* with file: in presentation-author before packing so that
# when the tarball is installed in a standalone directory pnpm can resolve @agentra/shared.
# NOTE: this mutates the in-container package.json only — no subsequent build step reads it.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('packages/presentation-author/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}}fs.writeFileSync('packages/presentation-author/package.json',JSON.stringify(p,null,2));"

# Pack @agentra/presentation-author — files field (["dist","vendor","templates","assets"])
# ensures all runtime assets are included in the tarball
RUN cd packages/presentation-author && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-presentation-author-*.tgz /tarballs/presentation-author.tgz

# Build production package.json for the runtime with file: references to tarballs
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('apps/presentation-author-runtime/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}}delete p.devDependencies;fs.mkdirSync('/deploy',{recursive:true});fs.writeFileSync('/deploy/package.json',JSON.stringify(p,null,2));"

# Production install: all packages are in the store from the full install above; --offline
# hard-fails if any package is missing, making store-population failures loud rather than silent
WORKDIR /deploy
RUN pnpm install --offline

# Copy built application dist
RUN cp -r /app/apps/presentation-author-runtime/dist ./dist

# Smoke tests: verify all runtime modules resolve correctly from the production install
RUN node -e "import('@agentra/shared').then(()=>console.log('shared ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('@agentra/presentation-author').then(()=>console.log('presentation-author ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('@aws-sdk/client-secrets-manager').then(()=>console.log('secrets-manager ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('pptxgenjs').then(()=>console.log('pptxgenjs ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('jszip').then(()=>console.log('jszip ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('mathjax-full/js/mathjax.js').then(()=>console.log('mathjax ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('prismjs').then(()=>console.log('prismjs ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('@resvg/resvg-js').then(()=>console.log('resvg ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})"

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

# Copy the production install (node_modules built from tarballs + dist)
# vendor, templates, and assets are included via the @agentra/presentation-author tarball
COPY --from=build /deploy ./

# Copy skill definitions (SKILL.md files read at runtime by AgentSkills plugin)
COPY apps/presentation-author-runtime/skills/ ./skills/

EXPOSE 8080

CMD ["node", "dist/agent.js"]

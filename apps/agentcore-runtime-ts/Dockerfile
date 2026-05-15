FROM node:22-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy workspace package.json files needed for install
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-tools/package.json packages/agent-tools/package.json
COPY apps/agentcore-runtime-ts/package.json apps/agentcore-runtime-ts/package.json

# Full install — populates pnpm store so the later production install can run offline
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

# Pack @agentra/shared — files field (["dist"]) ensures only built output is included
RUN mkdir -p /tarballs && \
    cd packages/shared && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-shared-*.tgz /tarballs/shared.tgz

# Replace workspace:* with file: in agent-tools before packing so that
# when the tarball is installed in a standalone directory pnpm can resolve @agentra/shared.
# NOTE: this mutates the in-container package.json only — no subsequent build step reads it.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('packages/agent-tools/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}}fs.writeFileSync('packages/agent-tools/package.json',JSON.stringify(p,null,2));"

# Pack @agentra/agent-tools — files field (["dist"]) ensures only built output is included
RUN cd packages/agent-tools && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-agent-tools-*.tgz /tarballs/agent-tools.tgz

# Build production package.json: workspace:* → file: tarball, registry ranges → exact installed
# versions read from node_modules. @agentra/shared is added explicitly so pnpm hoists it to
# top-level node_modules even though it is a transitive dep (not a direct dep of this runtime).
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('apps/agentcore-runtime-ts/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}else{try{const ins=JSON.parse(fs.readFileSync('node_modules/'+k+'/package.json','utf8'));p.dependencies[k]=ins.version;}catch(e){}}}p.dependencies['@agentra/shared']='file:/tarballs/shared.tgz';delete p.devDependencies;fs.mkdirSync('/deploy',{recursive:true});fs.writeFileSync('/deploy/package.json',JSON.stringify(p,null,2));"

# Production install: exact versions use pnpm store; --prefer-offline avoids re-downloading
# package tarballs (they're in the store from above) while allowing fast metadata-only fetches
WORKDIR /deploy
RUN pnpm install --prefer-offline

# Copy built application dist
RUN cp -r /app/apps/agentcore-runtime-ts/dist ./dist

# Smoke test: verify @agentra/shared and @agentra/agent-tools resolve correctly
RUN node -e "import('@agentra/shared').then(()=>console.log('shared ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})" && \
    node -e "import('@agentra/agent-tools').then(()=>console.log('agent-tools ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})"

FROM node:22-slim

WORKDIR /app
COPY --from=build /deploy ./
COPY apps/agentcore-runtime-ts/skills ./skills

EXPOSE 8080 8000 9000
CMD ["node", "dist/agent.js"]

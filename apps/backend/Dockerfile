FROM --platform=linux/arm64 node:24-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

# Copy workspace config (tsconfig.base.json excluded to avoid busting install cache on type-only changes)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json

# Full install — populates pnpm store so the later production install can run offline
RUN pnpm install --frozen-lockfile --filter @agentra/backend...

# Copy source (tsconfig.base.json copied here so install cache is unaffected by type changes)
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

RUN pnpm --filter @agentra/shared build
RUN pnpm --filter @agentra/backend build

# Pack @agentra/shared — files field (["dist"]) ensures only built output is included
RUN mkdir -p /tarballs && \
    cd packages/shared && pnpm pack --pack-destination /tarballs && \
    mv /tarballs/agentra-shared-*.tgz /tarballs/shared.tgz

# Build production package.json: workspace:* → file: tarball, registry ranges → exact installed
# versions read from node_modules so pnpm can resolve fully offline from the store
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('apps/backend/package.json','utf8'));for(const [k,v] of Object.entries(p.dependencies||{})){if(String(v).startsWith('workspace:')){p.dependencies[k]='file:/tarballs/'+k.replace('@agentra/','')+'.tgz';}else{try{const ins=JSON.parse(fs.readFileSync('node_modules/'+k+'/package.json','utf8'));p.dependencies[k]=ins.version;}catch(e){}}}delete p.devDependencies;fs.mkdirSync('/deploy',{recursive:true});fs.writeFileSync('/deploy/package.json',JSON.stringify(p,null,2));"

# Production install: exact versions use pnpm store; --prefer-offline avoids re-downloading
# package tarballs (they're in the store from above) while allowing fast metadata-only fetches
WORKDIR /deploy
RUN pnpm install --prefer-offline

# Copy built application dist
RUN cp -r /app/apps/backend/dist ./dist

# Smoke test: verify @agentra/shared resolves correctly
RUN node -e "import('@agentra/shared').then(()=>console.log('shared ok')).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);})"

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:24-slim

WORKDIR /app

COPY --from=build /deploy ./
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/health
ENV AWS_LWA_INVOKE_MODE=response_stream

EXPOSE 8080

CMD ["node", "dist/lambda.js"]

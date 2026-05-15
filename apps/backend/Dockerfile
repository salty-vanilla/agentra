FROM node:24-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json

RUN pnpm install --frozen-lockfile --filter @agentra/backend...

COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

RUN pnpm --filter @agentra/shared build 2>&1 | tee /tmp/shared-build.log
RUN cat /tmp/shared-build.log
RUN cd apps/backend && npx tsc -b --force
RUN pnpm --filter @agentra/backend deploy --legacy /deploy
RUN rm -rf /deploy/node_modules/@agentra/shared && cp -rL packages/shared /deploy/node_modules/@agentra/shared

FROM public.ecr.aws/docker/library/node:24-slim

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

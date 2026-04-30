FROM mcr.microsoft.com/playwright:v1.52.0-noble AS build

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.52.0-noble

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8080 8000 9000
CMD ["node", "dist/index.js"]

FROM mcr.microsoft.com/playwright:v1.52.0-noble AS build

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.52.0-noble

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
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8080 8000 9000
CMD ["node", "dist/index.js"]

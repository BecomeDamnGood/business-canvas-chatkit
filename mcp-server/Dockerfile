FROM node:20-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Prepare presentation template + fonts from source ZIP into assets/presentation/
RUN node scripts/prepare-presentation-assets.mjs

# Fail fast if ui/ template is missing from build context (prevents App Runner rollback from missing dist/ui at runtime)
RUN test -f ui/step-card.template.html || (echo "Missing ui/step-card.template.html in build context" && exit 1)

# Compile TS -> dist/
RUN npm run build
RUN test -f ui/step-card.bundled.html || (echo "Missing ui/step-card.bundled.html after build" && exit 1)


FROM node:20-slim AS runtime

ARG APP_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV VERSION=${APP_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice \
    poppler-utils \
    fonts-dejavu-core \
    unzip \
    zip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=build /app/dist ./dist

# Copy assets needed at runtime (presentation template)
COPY --from=build /app/assets ./assets
RUN test -f assets/presentation.pptx || (echo "Missing assets/presentation.pptx in runtime image" && exit 1)

# Install custom presentation fonts into system font directory (if present)
RUN if [ -d "assets/presentation/fonts" ]; then \
      mkdir -p /usr/local/share/fonts/business-canvas && \
      cp -f assets/presentation/fonts/* /usr/local/share/fonts/business-canvas/ && \
      fc-cache -f -v; \
    else \
      echo "No custom fonts found at assets/presentation/fonts; skipping font install"; \
    fi

# IMPORTANT: put UI next to dist/server.js so `new URL("./ui/step-card.bundled.html", import.meta.url)` works
COPY --from=build /app/ui ./dist/ui
RUN test -f dist/ui/step-card.bundled.html || (echo "Missing dist/ui/step-card.bundled.html in runtime image" && exit 1)

ENV PORT=8787
EXPOSE 8787

CMD ["node", "dist/server.js"]

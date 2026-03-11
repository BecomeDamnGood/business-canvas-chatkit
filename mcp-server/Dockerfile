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

# Compile TS -> dist/
RUN npm run build
RUN node scripts/verify-ui-runtime-artifacts.mjs --dist


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
RUN test -f dist/ui/step-card.bundled.html || (echo "Missing dist/ui/step-card.bundled.html in runtime image" && exit 1)
RUN test -d dist/ui/assets || (echo "Missing dist/ui/assets in runtime image" && exit 1)

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

# Run the app as a dedicated non-root user. LibreOffice and unzip process
# user-derived presentation content, so they must not run as root.
RUN groupadd --system appuser \
  && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser \
  && mkdir -p /home/appuser/.config /home/appuser/.cache /tmp/business-canvas-presentations \
  && chown -R appuser:appuser /app /home/appuser /tmp/business-canvas-presentations

ENV HOME=/home/appuser
ENV XDG_CONFIG_HOME=/home/appuser/.config
ENV XDG_CACHE_HOME=/home/appuser/.cache
ENV TMPDIR=/tmp

USER appuser

ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((res) => { if (!res.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]

FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Compile TS -> dist/
RUN npm run build


FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=build /app/dist ./dist

# IMPORTANT: put UI next to dist/server.js so `new URL("./ui/step-card.html", import.meta.url)` works
COPY --from=build /app/ui ./dist/ui

ENV PORT=8787
EXPOSE 8787

CMD ["node", "dist/server.js"]

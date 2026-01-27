FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["node","--loader","ts-node/esm","server.ts"]

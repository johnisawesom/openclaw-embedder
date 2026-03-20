# syntax=docker/dockerfile:1

FROM node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app

FROM base AS deps

COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --progress=false

FROM base AS build

COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src/ ./src/
RUN npm install --no-audit --progress=false
RUN npm run build

FROM base AS release

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

EXPOSE 8080

CMD ["node", "dist/index.js"]

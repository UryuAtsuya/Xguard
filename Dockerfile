FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY backend ./backend
COPY shared ./shared

RUN npm run build:api
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 10001 xguard \
  && useradd --system --uid 10001 --gid xguard --home-dir /app --shell /usr/sbin/nologin xguard \
  && mkdir -p /app/data/x-oauth-tokens \
  && chown -R xguard:xguard /app

COPY --from=builder --chown=xguard:xguard /app/node_modules ./node_modules
COPY --from=builder --chown=xguard:xguard /app/dist ./dist
COPY --from=builder --chown=xguard:xguard /app/package.json ./package.json

USER xguard

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4000}/health`).then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/backend/src/server.js"]

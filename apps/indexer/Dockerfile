# Production image for @unbnd/indexer (ADR 0013). esbuild-bundled, run as a
# one-off (compose profile: index). Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/indexer bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/indexer/dist/index.js ./index.js
CMD ["node", "index.js"]

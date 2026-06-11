# Production image for @unbnd/seeder (ADR 0008). esbuild-bundled, run as a
# one-off (compose profile: seed). Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/seeder bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/seeder/dist/index.js ./index.js
COPY --from=builder /repo/apps/seeder/dist/recast.js ./recast.js
CMD ["node", "index.js"]

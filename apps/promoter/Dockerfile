# Production image for @unbnd/promoter (ADR 0031). esbuild-bundled, run as a
# one-off per cron tick (compose profile: promote). Holds LIBRARIAN_NSEC; off the
# internet-facing path. Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/promoter bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/promoter/dist/index.js ./index.js
CMD ["node", "index.js"]

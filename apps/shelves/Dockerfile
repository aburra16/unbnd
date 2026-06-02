# Production image for @unbnd/shelves (ADR 0036). esbuild-bundled, run as a
# one-off (compose profile: shelves). Build context is the repo root. This is a
# LEAST-PRIVILEGE worker — it carries no LIBRARIAN_NSEC and signs nothing.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/shelves bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/shelves/dist/index.js ./index.js
CMD ["node", "index.js"]

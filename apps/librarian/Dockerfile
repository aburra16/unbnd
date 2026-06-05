# Production image for @unbnd/librarian (Story 58 / ADR 0057). esbuild-bundled,
# run as a one-off by the operator (compose profile: librarian) with a
# `profile` or `follows` subcommand. Holds LIBRARIAN_NSEC; off the
# internet-facing path. Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/librarian bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/librarian/dist/index.js ./index.js
ENTRYPOINT ["node", "index.js"]

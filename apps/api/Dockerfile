# Production image for @unbnd/api (ADR 0007).
# Builder bundles the API (+ @unbnd/schemas TS source) into one ESM file;
# the runtime is just node + that file. Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/api bundle

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/api/dist/index.js ./index.js
EXPOSE 8787
CMD ["node", "index.js"]

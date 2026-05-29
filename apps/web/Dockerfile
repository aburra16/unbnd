# Production image for @unbnd/web (ADR 0007): build the static site, then
# serve it (and reverse-proxy the API) from Caddy with automatic HTTPS.
# Build context is the repo root.
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @unbnd/web build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /repo/apps/web/dist /srv

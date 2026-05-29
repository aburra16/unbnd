# ADR 0007: Staging deployment architecture

**Status:** Proposed
**Date:** 2026-05-28
**Story:** `engineering-team/stories/6-staging-deploy.md`

## Context

Story 6 stands up a **staging** environment on one DigitalOcean droplet (plain Ubuntu, no Docker yet) at `staging.unbnd.ink`, so the story-4/5a sovereign flow runs over HTTPS against a real strfry. The repo today has only `docker-compose.yml` for the data layer (`unbnd/tapestry-data-layer:latest` = Neo4j + strfry + tapestry-api, Meilisearch, Postgres); there is no way to package or serve `apps/api` / `apps/web`, no TLS, no CD. Deploys reach the droplet via **GitHub Actions → SSH** (operator's choice). Books stay fixtures; custodial rating (5b) is out.

### Constraints

- pnpm monorepo. `apps/api` imports `@unbnd/schemas`, whose `main` is **TypeScript source** (`src/index.ts`) — it has no build output. So `node dist/index.js` cannot resolve it as-is; the production packaging must account for the TS workspace dependency. (Dev sidesteps this with `tsx`.)
- `apps/web` builds to static assets (`vite build` → `dist/`).
- Migrations already run on API start (ADR 0002/0003), so a fresh droplet Postgres self-migrates.
- No secrets in the repo (CLAUDE.md). Cookies already flip `Secure` when `NODE_ENV=production`.
- No new build/deploy tooling without an ADR (house rule) — this ADR authorizes what it introduces.

## Options considered

### API runtime packaging (the load-bearing decision)

- **A — esbuild single-file bundle (chosen).** A build stage bundles `apps/api/src/index.ts` and all its imports (including the `@unbnd/schemas` TS source and npm deps) into one `dist/index.js`; the runtime image is `node:22-slim` + that file, no `node_modules`. Smallest image, fastest cold start, and it resolves the TS-workspace-dep problem by inlining it. Cost: adds `esbuild` as a build dependency and a `bundle` script (kept separate from the existing `tsc` typecheck).
- **B — run via `tsx` in production.** Ship source + `node_modules` (incl. `tsx`), run `node --import tsx src/index.ts`. No new tooling, transparently handles the workspace TS dep (same as dev). Cost: larger image, source shipped, a transpile-on-start cost, and `tsx` in prod is unusual. Reasonable for staging but not the launch answer.
- **C — give `@unbnd/schemas` a real build (tsc emit + `exports`) and `tsc`-emit the API.** Most "standard" monorepo hygiene. Cost: more package config and a multi-package dist to assemble in the image; more moving parts than a bundle for the same staging outcome.

Chosen **A**: it is the clean, best-practice runtime (self-contained, tiny image) and directly solves the workspace-TS issue. esbuild is authorized here for the API production bundle only; CI keeps `tsc --noEmit` as the typecheck gate.

### Reverse proxy / TLS

- **A — Caddy (chosen).** Automatic HTTPS via Let's Encrypt with a two-line Caddyfile; serves the static web build and reverse-proxies `/auth` + `/api` to the API. Least config for a single host.
- **B — nginx + Certbot.** More moving parts (cert renewal cron, manual server blocks) for no staging benefit.

### Web serving

Static `apps/web/dist` is built in a stage and **baked into the Caddy image** (multi-stage: build web → copy `dist` into a `caddy` image alongside the Caddyfile). Caddy serves it and proxies the API. No separate web server process.

### Deploy mechanism (within "GitHub Actions → SSH")

- **A — SSH + build-on-droplet (chosen for staging).** On push to `main`, after CI passes, an Action SSHes to the droplet and runs `cd /opt/unbnd && git pull && docker compose -f docker-compose.prod.yml up -d --build`. The droplet holds a repo clone + an untracked `.env`. Registry-free, simplest mental model; the $48 droplet can build.
- **B — CI builds + pushes images to GHCR; droplet pulls.** Better image provenance and a lighter droplet, but adds registry auth on the droplet and image-tagging. Noted as the launch-time upgrade.

## Decision

One droplet, `docker compose -f docker-compose.prod.yml`:

```
caddy        : reverse proxy, auto-TLS for staging.unbnd.ink; serves web dist; proxies /auth,/api -> api:8787; only 80/443 exposed
api          : esbuild bundle on node:22-slim; reads env; runs migrations on start
tapestry     : unbnd/tapestry-data-layer:latest (Neo4j + strfry + tapestry-api)
db           : postgres:16
search       : meilisearch v1.10
```

- **Internal networking** (compose service names, no public ports except Caddy's 80/443): `DATABASE_URL=postgres://unbnd:…@db:5432/unbnd`, `STRFRY_URL=ws://tapestry:7777`, `NEO4J_BOLT_URL=bolt://tapestry:7687`, `SEARCH_URL=http://search:7700`, `TAPESTRY_API_URL=http://tapestry:80`. `PUBLIC_ORIGIN=https://staging.unbnd.ink`.
- **Caddyfile:**
  ```
  staging.unbnd.ink {
    handle /auth/*  { reverse_proxy api:8787 }
    handle /api/*   { reverse_proxy api:8787 }
    handle          { root * /srv; try_files {path} /index.html; file_server }
  }
  ```
- **API Dockerfile** (multi-stage): builder = `node:22` + corepack pnpm, `pnpm install --frozen-lockfile`, `pnpm --filter @unbnd/api bundle` (esbuild → `dist/index.js`); runtime = `node:22-slim`, copy `dist/index.js`, `CMD ["node","dist/index.js"]`.
- **Web Dockerfile** (multi-stage): builder builds `apps/web` (`pnpm --filter @unbnd/web build`); final = `caddy:2`, copy `dist` → `/srv`, copy `Caddyfile`.
- **`apps/api` gains a `bundle` script:** `esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.js` (+ `--banner` shim for `import.meta`/`require` interop if ESM needs it). `build` (tsc) and `typecheck` stay for CI.
- **Secrets:** generated by us (`BACKUP_ENCRYPTION_KEY` 32-byte hex; librarian keypair via `scripts/generate-keypair.js`; `NEO4J_PASSWORD`, `POSTGRES_PASSWORD`, `SEARCH_API_KEY` random), set as GitHub Actions secrets via `gh secret set`, and written to the droplet `/opt/unbnd/.env`. Only `LIBRARIAN_PUBKEY` (hex) goes to config; the librarian **nsec** is handed to the operator out of band, never committed. The `OWNER_PUBKEY` the data-layer image wants = the librarian hex pubkey.
- **CD workflow** (`.github/workflows/deploy.yml`): trigger `push` to `main`; `needs:` the CI job (or `workflow_run` after CI succeeds); steps = checkout, `appleboy/ssh-action` (or raw `ssh`) using `secrets.DROPLET_HOST` + `secrets.SSH_PRIVATE_KEY` to run the droplet update. Concurrency-guarded so two pushes don't deploy at once.
- **First-boot runbook** (committed `docs/DEPLOY.md`): install Docker + compose on Ubuntu; create a `deploy` user + add the Action's public deploy key; `git clone` to `/opt/unbnd`; write `.env`; `docker compose -f docker-compose.prod.yml up -d`; point `staging.unbnd.ink` A record at the droplet IP.

## Consequences

- **Enables** the sovereign flow live over HTTPS against real strfry; closes the AC-4/AC-5 live-relay gap (the gated integration test can run against the staging relay); every merge to `main` redeploys.
- **Constrains:** single droplet, brief restart on deploy (acceptable for staging). Build-on-droplet uses droplet CPU; fine at this size, revisit with GHCR for launch. esbuild bundling assumes all API deps are pure-JS-bundleable (they are: express, postgres, ws, neo4j-driver, drizzle-orm, @noble/ciphers, nostr-tools, applesauce-core, cookie). If any resists bundling, mark it `--external:` and copy its `node_modules` entry.
- **Affects existing fixtures?** No. **New dependency?** Yes — `esbuild` (devDependency, API bundle); `caddy:2`, `node:22-slim` base images. **PRD change?** No.
- **Security:** secrets only in Actions secrets + droplet `.env` (0600, untracked); `Secure` cookies via `NODE_ENV=production`; `__Host-` prefix + rate limiting remain cycle-5. The librarian nsec lives only on the operator's side; the server holds only its hex pubkey.

## Implementation notes

- New files: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `deploy/Caddyfile`, `docker-compose.prod.yml`, `.env.production.example`, `.github/workflows/deploy.yml`, `docs/DEPLOY.md`. `apps/api/package.json` gains `esbuild` + a `bundle` script.
- `.dockerignore` to keep `node_modules`/`dist` out of build context.
- Validate locally where possible: `docker build` both images; `docker compose -f docker-compose.prod.yml config`; a local `up` with a self-signed/`localhost` Caddy site to smoke the proxy. Full TLS + relay verification happens on the droplet.
- Go-live prerequisites (operator + me together): droplet IP, an SSH deploy keypair (I generate; operator installs the public key on the droplet), the DNS A record, and confirming `unbnd/tapestry-data-layer:latest` is pullable on the droplet (else build/push it from the Tapestry repo first — flagged).

## Out of scope

Public launch, real book seeding, blue-green/zero-downtime, monitoring/alerting, `__Host-` cookies, rate limiting, secrets manager — all later. Custodial rating is story 5b.

## Amendment (2026-05-28): GHCR images supersede build-on-droplet

The original "deploy mechanism: SSH + build-on-droplet" choice is **superseded** before go-live. Two facts forced it: (1) `unbnd/tapestry-data-layer:latest` is not published anywhere — it must be built from `nous-clawds4/tapestry` (compiles strfry from C++ source + installs Neo4j), and (2) the operator wants the non-shortcut path and to protect droplet resources. Building that on the runtime host each deploy is the anti-pattern we should avoid; it also burns the 2 vCPU / 8 GB droplet's CPU/disk and is non-reproducible.

**Revised decision — build in CI, push to GHCR, the droplet only pulls:**

1. **Three images on GHCR** (`ghcr.io/aburra16/`): `unbnd-api`, `unbnd-web` (Caddy + static build), `unbnd-tapestry-data-layer`.
2. **`publish-images.yml`** builds `api` + `web` on each successful CI run on `main` (and `workflow_dispatch`), via the built-in `GITHUB_TOKEN` (no PAT), tagged `:latest` + `:<sha>`, with GHA layer caching.
3. **`publish-tapestry-data-layer.yml`** (`workflow_dispatch`) checks out **`nous-clawds4/tapestry` at a pinned commit** (default `6a9391fd…`, concept-graph) and builds its `Dockerfile` on GitHub runners — the heavy strfry/Neo4j compile never touches the droplet, and upstream is never modified (no PR/push to David's repo required; his repo is public so we build *from* it). Bump the ref deliberately.
4. **`docker-compose.prod.yml`** now references `image:` (GHCR) instead of `build:`; **`deploy.yml`** does `docker compose pull && up -d` (no `--build`).
5. **Image visibility:** recommended **public** for staging — the images contain no secrets (config is injected at runtime via env) and the source repos are public, so public images leak nothing and spare the droplet any registry credential. Trivially switchable to private + a `read:packages` login for launch.

**Why this is strictly better:** immutable, version-pinned, reproducible artifacts; fast deploys (pull, not a multi-minute compile); the droplet spends its resources running, not building; and it is the path we want for launch anyway, so it is not rework. The trade is a little more CI plumbing, which is the correct investment.

A courtesy issue to David proposing official upstream image publishing is optional and non-blocking; it does not gate staging.

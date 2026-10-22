# Data layer — local development

Unbnd's data layer is one Docker service, plus Brainstorm's search relay:

- **`tapestry`** — the Tapestry container, built locally from upstream source. Runs strfry (nostr relay), Neo4j (graph DB), the brainstorm Express server, GrapeRank, and nginx under supervisord.
- **Search** — Brainstorm's search relay (`SEARCH_URL`, default `wss://search.brainstorm.world`), read through `@unbnd/search` (ADR 0095, ADR 0100). Nothing runs locally for it.

`apps/api` runs on the host (`pnpm dev:api`) and probes the data layer via `/health/data`.

## Prerequisites

- Docker Desktop or Docker Engine 24+
- pnpm 9+
- Node 20+

## One-time setup

Generate a relay-level admin keypair for the Tapestry container. The hex pubkey goes in `.env`; the nsec is your responsibility to store safely.

```
node scripts/generate-keypair.js
```

Copy the example env file and fill in the values printed above:

```
cp .env.example .env
# Edit .env: paste the hex pubkey into OWNER_PUBKEY, choose a strong NEO4J_PASSWORD.
```

Build the Tapestry data-layer image. First build takes 10-20 minutes; subsequent rebuilds reuse the layer cache.

```
./scripts/build-tapestry-image.sh
```

The script reads `scripts/tapestry-version.txt` (branch + commit SHA) and clones the upstream Tapestry repo to `~/.cache/unbnd/tapestry-src` by default. Override the clone destination with `TAPESTRY_SRC=path` if you already have a local Tapestry clone.

## Start the stack

```
docker compose up -d
docker compose ps
```

Both `unbnd-tapestry` and `unbnd-db` should be in the `running` state.

## Stop the stack

```
docker compose down
```

Stopping with `docker compose down` preserves the named volumes — your Neo4j data and strfry events survive a restart. To **also clear the volumes**, run:

```
docker compose down -v
```

This wipes everything. Use it when you want to start fresh.

## Reset

Full reset (clear all data, rebuild the image, start clean):

```
docker compose down -v
./scripts/build-tapestry-image.sh
docker compose up -d
```

## Health check

With the stack up, start the API and hit the data health endpoint:

```
pnpm dev:api
curl -fsS http://localhost:8787/health/data | jq
```

Expected when everything is reachable:

```json
{
  "ok": true,
  "services": {
    "strfry":   { "ok": true, "latencyMs": 12 },
    "neo4j":    { "ok": true, "latencyMs": 38 },
    "tapestry": { "ok": true, "latencyMs": 21 },
    "search":   { "ok": true, "provider": "nip50", "latencyMs": 180 }
  }
}
```

If any probe fails, the endpoint returns HTTP 503 with `ok: false` and a per-service `error` message.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OWNER_PUBKEY` | yes | — | Hex pubkey for the Tapestry container's relay-level admin identity. Distinct from the future Unbnd Librarian pubkey. |
| `NEO4J_PASSWORD` | yes | — | Neo4j password. Choose a strong value for dev. |
| `STRFRY_URL` | no | `ws://localhost:7777` | WebSocket URL apps/api uses to probe strfry. |
| `NEO4J_BOLT_URL` | no | `bolt://localhost:7687` | Bolt URL apps/api uses to probe Neo4j. |
| `NEO4J_USER` | no | `neo4j` | Bolt user. |
| `TAPESTRY_API_URL` | no | `http://localhost:8080` | HTTP base URL of the Tapestry Express API. |
| `SEARCH_URL` | no | `wss://search.brainstorm.world` | The search relay (NIP-50). |

## Swapping the search provider

`apps/api` searches through the `SearchProvider` interface in `@unbnd/search`; the one implementation is `packages/search/src/nip50.ts`, which reads the search relay. Another backend would be one more file implementing that interface, chosen where `apps/api/src/index.ts` builds the provider.

## Updating the Tapestry image

To pull in upstream Tapestry changes:

1. Edit `scripts/tapestry-version.txt` — change the branch name (if needed) and update the commit SHA to the new upstream tip.
2. Run `./scripts/build-tapestry-image.sh` to rebuild.
3. `docker compose up -d --force-recreate tapestry` to restart with the new image.

The version-pin file is the canonical audit trail. `git log scripts/tapestry-version.txt` shows when each upgrade happened.

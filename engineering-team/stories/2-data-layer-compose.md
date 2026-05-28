# Story 2: Data-layer stack via Docker Compose

**Status:** Approved
**Created:** 2026-05-28
**Type:** Feature

## Background

Story 1 locked the TypeScript shapes for every DList event Unbnd will publish. Every downstream story — publishing ratings, reading ratings back, importing the Open Library catalog, indexing for search, computing trust-weighted aggregations — needs a running data layer to talk to. Today, `apps/api` exposes a stub `/health` endpoint that proves the API is running. There is no way for a developer to bring up the full data layer with one command, and no smoke test that proves apps/api can reach what it needs to reach.

PRD §10 lays out the stack: a Tapestry Docker container (strfry + Neo4j + the Tapestry Express server + GrapeRank pipeline + nginx) plus Meilisearch for the book catalog full-text index. PRD §10.2 says local development is Docker Compose, production is a single Digital Ocean droplet. This story stands up the local dev compose.

Two complications worth pinning before design:

1. **The Tapestry image is not published to a registry.** Tapestry's own `docker-compose.yml` uses `build: .` against the Tapestry repo. Unbnd needs an explicit story for sourcing the image — a build script that clones the upstream Tapestry repo, builds it, and tags it as a local image (`unbnd/tapestry-data-layer:latest`) the Unbnd compose references. The Architect picks the exact upstream branch (likely `concept-graph`).
2. **Brainstorm is migrating its search layer from Meilisearch to Vespa.** Unbnd ships with Meilisearch today, but every name we expose at the boundary (compose service name, env vars, the apps/api provider interface) is provider-neutral so a future swap to Vespa is a single-file change inside `apps/api/src/search/` plus a compose image swap. Cycle 2 introduces only the `health()` slot of the provider interface; `index` / `search` / `delete` ship with the search-wiring story.

## User-facing description

As an engineer working on Unbnd, I want a single `docker compose up -d` command that brings up the entire data layer (strfry, Neo4j, the Tapestry Express server, search), and a single `pnpm dev:api` against it that exposes `/health/data` reporting each dependency as reachable, so I can verify the stack works end-to-end before writing any read/write code against it.

End users see no change.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: `docker-compose.yml` at the Unbnd repo root brings up two services: `tapestry` (the Tapestry data-layer image) and `search` (Meilisearch today; service name stays generic).
- [ ] AC-2: After `docker compose up -d`, the following ports are reachable from the host:
  - strfry websocket on `ws://localhost:7777`
  - Neo4j browser on `http://localhost:7474`
  - Neo4j bolt on `bolt://localhost:7687`
  - Tapestry Express API on `http://localhost:8080`
  - Search service on `http://localhost:7700`
- [ ] AC-3: A `.env.example` at the repo root documents `OWNER_PUBKEY`, `NEO4J_PASSWORD`, `SEARCH_API_KEY`, `SEARCH_PROVIDER`, and the four `*_URL` defaults. `.gitignore` keeps `.env` out of source control.
- [ ] AC-4: `scripts/build-tapestry-image.sh` clones the upstream Tapestry repo to a documented local path, builds the image, and tags it as `unbnd/tapestry-data-layer:latest`. Re-running the script is safe (idempotent build); the compose just references the tag.
- [ ] AC-5: `apps/api` exposes `GET /health/data` that probes each dependency and returns JSON of the form `{ "ok": true|false, "services": { "strfry": "...", "neo4j": "...", "tapestry": "...", "search": { "ok": true, "provider": "meili" } } }`. Top-level `ok` is true iff every dependency reports reachable.
- [ ] AC-6: `apps/api/src/search/SearchProvider.ts` declares a provider-neutral interface with at minimum `health()`. `apps/api/src/search/meili.ts` is the current implementation; `meili.ts` is the only file in `apps/api/src/search/` that imports the Meilisearch client.
- [ ] AC-7: Compose volumes for Neo4j and strfry data survive `docker compose down` (only `docker compose down -v` clears them). Documented in the docs file.
- [ ] AC-8: A docs file (`docs/data-layer.md`) documents: how to build the Tapestry image, start/stop/reset the stack, run the health check, and the env-var contract.

## DList shapes touched

None. This story stands up the runtime that DList events will eventually flow through, but ships no event-publishing or event-reading code.

## Out of scope

- Production TLS / certificates / nginx reverse-proxy configuration. PRD §10.2 mentions Let's Encrypt and GitHub Actions deploy; that's a Phase-1-late story.
- GrapeRank tuning. The Tapestry container runs GrapeRank as part of its brainstorm Express server; we don't touch its configuration.
- The Unbnd Librarian key generation. The Librarian is the system signing key for catalog imports (PRD §7.2). Generating it is a separate story tied to the Open Library import or the publish-path story.
- Actually publishing or reading DList events from `apps/api`. The `health()` probes touch each service to confirm reachability; they do not publish or read user data. The publish path is its own story.
- The Meilisearch index schema (which documents, which fields are searchable / filterable / sortable). This story stands up an empty Meili instance. Index design is a story tied to the search-wiring work.
- The full `SearchProvider.index` / `search` / `delete` interface methods. Cycle 2 ships only `health()`.
- Switching to Vespa today. We name everything neutrally so a future swap is small, but we do not introduce Vespa in this story.
- Open Library catalog import.
- Custodial auth crypto.
- Any UI work in `apps/web`.

PRD §11.3 "Out of Scope" list is undisturbed by this story.

## Open questions

The Architect will resolve these in the ADR:

- Which upstream Tapestry branch to build from: `concept-graph` (the canonical baseline) or `feat/communities` (which has the more recent DList primitives Unbnd will lean on). The build script needs to pin one.
- Whether to use the `docker-compose.yml` or a `docker-compose.dev.yml` for the dev stack. Tapestry has both upstream; Unbnd may want a single file for simplicity since we already separate dev (host-side apps/api) from prod (eventual deploy).
- How `apps/api` resolves env vars at startup — process.env directly, or a small `config.ts` that validates + defaults the set. Recommended: `config.ts`; clear contract for missing/invalid values.
- Whether the Tapestry container's OWNER_PUBKEY (used for relay-level admin) should be generated by the build script, supplied via `.env.example` as a placeholder, or left for the developer to provide. Note: OWNER_PUBKEY is distinct from the Unbnd Librarian pubkey.
- Whether `/health/data` runs each probe in parallel or sequentially. Parallel is faster; sequential is easier to read in logs.
- Whether `/health/data` should be authenticated. For dev: no. For prod: probably behind an admin token. This story can ship unauthenticated and the Architect notes the prod-time hardening as a deferred concern.

## Linked artifacts

- ADR: `engineering-team/decisions/0002-data-layer-compose.md`
- Test plan: `engineering-team/stories/2-data-layer-compose.test-plan.md`
- Review: (filled in after Review phase)

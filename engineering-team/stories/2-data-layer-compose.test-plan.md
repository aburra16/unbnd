# Test Plan: Story 2 — Data-layer stack via Docker Compose

**Story:** `engineering-team/stories/2-data-layer-compose.md`
**ADR:** `engineering-team/decisions/0002-data-layer-compose.md`
**Date:** 2026-05-28

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 (compose has `tapestry` + `search` services) | `apps/api/test/infrastructure/compose.test.ts` | file-content |
| AC-2 (five host ports reachable) | manual verification (see §"Manual verification") | integration |
| AC-3 (`.env.example` + `.gitignore` content) | `apps/api/test/infrastructure/env-example.test.ts` | file-content |
| AC-4 (build script idempotent + pin-driven) | `apps/api/test/infrastructure/scripts.test.ts` + manual verification | file-content + manual |
| AC-5 (`/health/data` JSON shape + status code) | `apps/api/test/routes/health.test.ts` | component (supertest) |
| AC-6 (`SearchProvider` interface + Meili impl) | `apps/api/test/search/meili.test.ts`, `apps/api/test/search/index.test.ts` | unit |
| AC-7 (volumes survive `down`, cleared by `down -v`) | manual verification | integration |
| AC-8 (`docs/data-layer.md` sections present) | `apps/api/test/infrastructure/docs.test.ts` | file-content |

Plus two cross-cutting test files that don't map to a single AC:
- `apps/api/test/config.test.ts` — covers the env validation contract that AC-3 implies and AC-5 depends on.
- `apps/api/test/probes/timeout.test.ts` — covers the 3-second deadline behavior that AC-5's "3-second timeout" sub-clause depends on.

## Edge cases

- [x] `loadConfig` throws on missing required vars (NEO4J_PASSWORD, SEARCH_API_KEY).
- [x] `loadConfig` applies the four documented defaults when the corresponding env vars are absent.
- [x] `loadConfig` accepts `SEARCH_PROVIDER=vespa` even though the impl isn't shipped yet (type accepts both values).
- [x] `loadConfig` rejects unknown SEARCH_PROVIDER values.
- [x] `loadConfig` parses `PORT` as a number, not a string.
- [x] `withTimeout` returns the inner result when fn resolves before the deadline.
- [x] `withTimeout` returns ok=false with the rejection message when fn throws.
- [x] `withTimeout` returns ok=false with a timeout error when fn exceeds the deadline.
- [x] `withTimeout` aborts the inner signal when the deadline fires.
- [x] `withTimeout` populates `latencyMs` on every successful result.
- [x] `MeiliProvider.health()` includes the `Authorization: Bearer <key>` header.
- [x] `MeiliProvider.health()` returns ok=true on 200 + `status: "available"`.
- [x] `MeiliProvider.health()` returns ok=false on a non-2xx response.
- [x] `MeiliProvider.health()` returns ok=false when fetch itself throws.
- [x] `resolveProvider(config)` returns `MeiliProvider` for `searchProvider: "meili"`.
- [x] `resolveProvider(config)` throws for `searchProvider: "vespa"` (impl not shipped).
- [x] `resolveProvider(config)` throws on an unknown provider string.
- [x] `/health` returns 200 + liveness payload.
- [x] `/health/data` returns 200 + per-service results when every probe is ok.
- [x] `/health/data` returns 503 when any probe fails.
- [x] `/health/data` runs probes in parallel (all four probe call traces present even if one fails).
- [x] `/health/data` reports the search provider name in its sub-result.
- [x] `docker-compose.yml` declares both `tapestry` and `search` services.
- [x] `docker-compose.yml` references `unbnd/tapestry-data-layer:latest` rather than a build context.
- [x] `docker-compose.yml` uses the generic `search:` service name, not `meili:` or `meilisearch:`.
- [x] `docker-compose.yml` exposes the five required host ports.
- [x] `docker-compose.yml` declares named volumes for Neo4j, strfry, and the search service.
- [x] `docker-compose.yml` maps `SEARCH_API_KEY` → `MEILI_MASTER_KEY` at the container boundary.
- [x] `.env.example` documents every required + defaulted env var.
- [x] `.env.example` uses generic SEARCH_* naming, not MEILI_*.
- [x] `.gitignore` excludes `.env`.
- [x] `scripts/tapestry-version.txt` exists with parseable branch + 40-char SHA.
- [x] `scripts/build-tapestry-image.sh` exists, is executable, has a bash shebang, reads the pin file, tags `unbnd/tapestry-data-layer`.
- [x] `scripts/generate-keypair.js` exists and mentions both pubkey and nsec.
- [x] `docs/data-layer.md` exists and covers prerequisites, build, start, stop, reset, health, env, and the provider-swap path.
- [x] `docs/data-layer.md` references `docker compose up` and `docker compose down`.
- [x] `docs/data-layer.md` warns that `docker compose down -v` clears the data volumes.

## Test infrastructure

- **Runner:** Vitest 2.1.x. Authorized for `apps/api` by ADR 0002 (cycle 2 is the first apps/api consumer).
- **HTTP test client:** `supertest` ^7.0.0. Authorized by ADR 0002 (named in §"Implementation notes" indirectly via the `routes/health.test.ts` plan; documented in this test plan as the dev-dep added to `apps/api`).
- **Mock strategy:** `vi.fn()` for inline mocks. The route tests inject mocked probe functions and a mocked `SearchProvider`, so no real strfry/Neo4j/Tapestry/Meili instances are required for any unit or component test.
- **File-content tests** read sibling files via `node:fs` relative to a computed REPO_ROOT. No external services; tests are hermetic.
- **Compose-up prerequisite:** none. Every test in this story runs without `docker compose` having been invoked.
- **Environment:** Node `node` env (no DOM). `apps/api/vitest.config.ts` is minimal.

## How to run

```
# apps/api only
pnpm --filter @unbnd/api test

# Whole workspace
pnpm -r test
```

Typecheck gate (independent):

```
pnpm -r typecheck
```

## Manual verification — what the Reviewer must run by hand

Tests cover everything that can be tested without a running data layer. The following five steps verify the parts that require real containers; the Reviewer runs them when checking AC-2, AC-4 (idempotency), and AC-7.

1. **Build the Tapestry image.**
   ```
   ./scripts/build-tapestry-image.sh
   docker images | grep tapestry-data-layer
   ```
   Expect: an image tagged `unbnd/tapestry-data-layer:latest` and a short-SHA variant. Re-running the script must not error.

2. **Stand up the stack.**
   ```
   cp .env.example .env
   # Edit .env: set OWNER_PUBKEY (from scripts/generate-keypair.js output) and a strong NEO4J_PASSWORD.
   docker compose up -d
   docker compose ps
   ```
   Expect: both services Running.

3. **Hit every port.**
   ```
   curl -fsS http://localhost:8080/api/health || curl -fsSI http://localhost:8080
   curl -fsS http://localhost:7474
   curl -fsS http://localhost:7700/health
   # strfry: open a WS client (e.g., websocat) to ws://localhost:7777
   # Neo4j bolt: cypher-shell -a bolt://localhost:7687 -u neo4j -p $NEO4J_PASSWORD 'RETURN 1'
   ```
   Expect: 2xx for HTTP probes, connection accepted for WS and bolt.

4. **Run the /health/data endpoint against the live stack.**
   ```
   pnpm dev:api &
   curl -fsS http://localhost:8787/health/data | jq
   ```
   Expect: top-level `ok: true`, every sub-service `ok: true`, `services.search.provider === "meili"`.

5. **Volume persistence.**
   ```
   # Seed: open Neo4j browser, create a node, leave it.
   docker compose down
   docker compose up -d
   # Re-open Neo4j browser, verify the node is still there.
   docker compose down -v
   docker compose up -d
   # Verify the node is gone (volumes were cleared).
   ```

## Verification — failing-for-the-right-reason

Confirmed 2026-05-28. After the Tester phase committed, the following gates fail as designed and will all pass after the Implementer completes the work.

### `pnpm --filter @unbnd/api test`

```
Test Files  9 failed (9)
     Tests  70 failed | 2 passed (72)
```

Failure modes are exactly the two expected:

1. **TypeScript source stubs throw "not implemented"** — `loadConfig`, `withTimeout`, `MeiliProvider` constructor / `health`, `resolveProvider`, `buildHealthRouter` all throw. The Implementer replaces each stub body.
2. **Infrastructure files do not yet exist** — `docker-compose.yml`, `.env.example`, `scripts/tapestry-version.txt`, `scripts/build-tapestry-image.sh`, `scripts/generate-keypair.js`, `docs/data-layer.md` are all absent. The Implementer creates each.

The 2 incidentally-passing tests are negative-content checks in `compose.test.ts` and `env-example.test.ts` ("does not contain `meili:` service name", "does not use MEILI_ env vars") that pass vacuously when the file doesn't exist. They become meaningful as soon as the file is created.

### `pnpm --filter @unbnd/api typecheck`

Passes. The stub source files satisfy their declared types; only the runtime bodies are missing.

## Notes for the Implementer

Suggested order:

1. **`src/config.ts`** — implement `loadConfig`. Tests in `test/config.test.ts` should all turn green.
2. **`src/probes/timeout.ts`** — `Promise.race` against a setTimeout, with `AbortController` wiring. Tests in `test/probes/timeout.test.ts` turn green.
3. **`src/search/meili.ts`** — `health()` does `fetch(\`${config.searchUrl}/health\`, { headers: { Authorization: \`Bearer ${config.searchApiKey}\` } })`, checks status + body, populates ok/error/latency. Tests in `test/search/meili.test.ts` turn green.
4. **`src/search/index.ts`** — `resolveProvider` switch on `config.searchProvider`. `test/search/index.test.ts` turns green.
5. **`src/probes/strfry.ts`, `neo4j.ts`, `tapestry.ts`** — real implementations using `ws`, `neo4j-driver`, `fetch`. Wrap in `withTimeout`. Not directly unit-tested, but covered by the manual /health/data verification.
6. **`src/routes/health.ts`** — `buildHealthRouter(deps)` constructs the Express router with `/health` and `/health/data` handlers. Tests in `test/routes/health.test.ts` turn green.
7. **`src/index.ts`** — wire `loadConfig()` → `resolveProvider()` → `buildHealthRouter()` → `app.use("/", router)`. Replace the existing /health stub.
8. **Infrastructure files** — `docker-compose.yml`, `.env.example`, `.gitignore` line, `scripts/tapestry-version.txt`, `scripts/build-tapestry-image.sh` (and `chmod +x`), `scripts/generate-keypair.js`, `docs/data-layer.md`. Infrastructure tests in `test/infrastructure/` turn green.

After all that, `pnpm --filter @unbnd/api test` should be fully green and the manual verification steps should pass against a fresh `docker compose up -d`.

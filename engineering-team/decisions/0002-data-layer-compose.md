# ADR 0002: Data-layer stack via Docker Compose

**Status:** Proposed
**Date:** 2026-05-28
**Story:** `engineering-team/stories/2-data-layer-compose.md`

## Context

Story 2 brings up the Tapestry data-layer container plus a generically-named `search` service (Meilisearch today, Vespa-swappable tomorrow) via one `docker compose up`. `apps/api` gains a `/health/data` endpoint that probes each dependency. Provider boundary at `apps/api/src/search/SearchProvider.ts` introduces the seam for swapping Meili out later.

Eight acceptance criteria from the story drive every decision below. Two design questions have architectural weight; the rest are settled by Tapestry prior art or by the story's open-questions list.

### Tapestry prior-art survey

**Tapestry's own compose** (`concept-graph` branch, `docker-compose.yml`) is single-service: one container running Neo4j, strfry, strfry-router, and the brainstorm Express server under supervisord, with nginx in front. Built locally via `build: .` against the Tapestry repo. Ports exposed: 80 → 8080, 7777 (strfry), 7778 (strfry websocket admin), 7474 (Neo4j HTTP), 7687 (Neo4j bolt), 8687 (Neo4j admin). Volumes: `tapestry-neo4j`, `tapestry-strfry`, `tapestry-data`, `tapestry-logs`. Env vars: `OWNER_PUBKEY`, `NEO4J_PASSWORD`, `DOMAIN_NAME`. Source: `git show origin/concept-graph:docker-compose.yml`.

**Tapestry's image** (`Dockerfile`) is Ubuntu 22.04 + Node 22 + strfry compiled from source + Neo4j 5.26.10 with GDS 2.13.4 and APOC 5.26.10 plugins + JDK 17 + nginx + supervisord. First build is in the 10-20 minute range; subsequent rebuilds use BuildKit's layer cache. Source: `git show origin/concept-graph:Dockerfile`.

**Tapestry does not publish a registry image.** No `image:` directive in their compose; no GHCR / Docker Hub publication that I can find. Unbnd has to build locally.

**Meilisearch and Vespa are not part of Tapestry's image.** Search is Unbnd's own concern. PRD §10.1 lists Meilisearch as Unbnd's full-text search; the story notes Brainstorm is migrating its own search to Vespa, so we name our service generically. The Tapestry container does not depend on our search service.

**GrapeRank lives inside the Tapestry image.** Per the supervisord config, the brainstorm Express server boots scheduled work that includes GrapeRank computation. No separate process for us to orchestrate.

### CLAUDE.md invariants — what this design must honor

- **POV-first.** The /health/data endpoint reports reachability, not "trusted state." Probes are observer-agnostic.
- **Decentralized-first.** N/A at the infrastructure level; no event acceptance gates introduced.
- **Filter at view time.** N/A at the infrastructure level.
- **Librarian pubkey at runtime.** This story does not touch the Librarian pubkey. The Tapestry container's `OWNER_PUBKEY` is distinct (relay-level admin key); the Librarian (Unbnd's catalog signer) is a future story.
- **PRD scope discipline.** Nothing from §11.3 sneaks in. No payment paths, no file hosting, no UI changes.

### Project constraints

- pnpm workspace. The `apps/api` package gains new dependencies (`neo4j-driver`, `ws`) and a small refactor (extract handlers, add config + probes).
- `pnpm -r typecheck` is the type gate. `pnpm -r test` is the test gate. `apps/api` will need Vitest installed for the test-design phase.
- The dev path for apps/api stays `pnpm dev:api` on the host. No apps/api containerization in this story.
- The story's "Out of scope" line forbids actually publishing or reading DList events. Probes touch each service to confirm reachability; they do not author or query data.

## Options considered

### Option A — Build script + version pin file

`scripts/build-tapestry-image.sh` is a bash script that:
1. Reads `scripts/tapestry-version.txt` (two lines: branch name, commit SHA).
2. Resolves a clone destination — `${TAPESTRY_SRC:-~/.cache/unbnd/tapestry-src}` so power users can point at an existing clone.
3. If the destination exists, fetches and resets to the pinned commit. If not, clones the upstream repo (`https://github.com/nous-clawds4/tapestry.git`) into the destination and checks out the pinned commit.
4. Runs `docker build` against the destination, tagging the result `unbnd/tapestry-data-layer:latest` and also `unbnd/tapestry-data-layer:<short-sha>`.
5. Embeds the upstream SHA as a Docker LABEL on the image.

The compose file references the tag (`image: unbnd/tapestry-data-layer:latest`). No `build:` directive in the compose. Every developer gets a deterministic, reproducible image from a single-line edit to `tapestry-version.txt`.

**Pros**
- Reproducible across machines via the version-pin file.
- One-line edit to update the upstream commit; one command to rebuild.
- Power users can point at an existing local Tapestry clone via `TAPESTRY_SRC`.
- Compose file stays clean — no build context, no `args:` for the upstream commit.
- The pin file is a great audit trail: `git log scripts/tapestry-version.txt` shows the data-layer history.

**Cons**
- One extra file to maintain (`tapestry-version.txt`) and a one-time script run for first-time developers.
- The script lives outside the Docker build context, so contributors who only know `docker compose build` will be confused. Mitigated by docs and an error message in `docker compose build` if anyone tries it.

### Option B — `docker/tapestry/Dockerfile.tapestry` with in-build git clone

A second Dockerfile in `docker/tapestry/` does a multi-stage build:

```dockerfile
ARG TAPESTRY_REF=6a9391fd
FROM alpine/git AS source
ARG TAPESTRY_REF
RUN git clone --depth=20 https://github.com/nous-clawds4/tapestry.git /tapestry \
 && cd /tapestry && git checkout ${TAPESTRY_REF}

# ... then a second stage that does `COPY --from=source /tapestry /build` and runs Tapestry's own Dockerfile contents inline.
```

The compose has `build: { context: ./docker/tapestry, args: { TAPESTRY_REF: 6a9391fd } }`. No external script; `docker compose build` Just Works.

**Pros**
- Self-contained. `docker compose build` is the one-command build.
- No bash script to maintain.

**Cons**
- Docker layer cache busts on every commit-SHA change. The shallow clone is fast (~5 seconds) but feels wasteful when nothing else changed.
- Recreating Tapestry's full Dockerfile content inside our second stage means we either copy it (drift risk) or use Tapestry's Dockerfile as-is via `dockerfile:` build arg, which forces us to keep the cloned source around during the whole build (more disk).
- Updating the pin requires editing the Dockerfile, which `git log` shows as a Dockerfile change rather than a clean version-pin change. Audit trail is messier.
- Cache-mount workarounds for the git clone are real but add BuildKit-specific complexity that not all developers have configured.

### (Option C — git submodule under `vendor/tapestry/`)

Listed for completeness. Submodules pin a specific commit and survive `git pull`. But: bloats the Unbnd repo with a large external history; demands every developer run `git submodule update --init`; updates require both the submodule pointer change and a separate Tapestry-side commit hash. The pin file in Option A gives us 95% of the determinism with 10% of the operational burden.

## Decision

We chose **Option A** — build script + `scripts/tapestry-version.txt` pin file — for the Tapestry image sourcing.

The full design:

1. **Compose structure:** single `docker-compose.yml` at the repo root with two services, `tapestry` and `search`. `apps/api` stays on host.
2. **Tapestry image:** built locally by `scripts/build-tapestry-image.sh`, pinned via `scripts/tapestry-version.txt` (initial pin: `concept-graph` branch at `6a9391fd`), tagged `unbnd/tapestry-data-layer:latest`.
3. **Search service:** Meilisearch v1.10 image (`getmeili/meilisearch:v1.10`), service name `search`, env vars `SEARCH_API_KEY` and `SEARCH_PROVIDER=meili`.
4. **Volumes:** four named volumes (`unbnd-neo4j`, `unbnd-strfry`, `unbnd-tapestry-data`, `unbnd-search`) so `docker compose down` preserves data.
5. **Env contract:** `.env.example` documents all required and optional variables. `.env` is gitignored. `apps/api/src/config.ts` validates + defaults at startup.
6. **`/health/data`:** `Promise.allSettled` over four probes (strfry, Neo4j, Tapestry API, search), each capped at 3-second timeout, returning the JSON shape AC-5 specifies.
7. **Search provider boundary:** `apps/api/src/search/SearchProvider.ts` declares the interface, `apps/api/src/search/meili.ts` is the only concrete impl. Cycle 2 ships only `health()`; `index` / `search` / `delete` come with the search-wiring story.
8. **OWNER_PUBKEY:** `.env.example` placeholder; `scripts/generate-keypair.js` prints a fresh pubkey + nsec to stdout for the developer to paste in.

## Consequences

**Enables**
- Every downstream story (publish path, read path, Open Library import, search wiring, GrapeRank wiring, custodial auth crypto with strfry-backed events) has a known-good local data layer to develop against.
- `/health/data` becomes a smoke-test surface that every future cycle's Tester can call from a beforeAll hook to confirm the stack is up.
- The search swap path is real: replacing Meilisearch with Vespa later means a new `apps/api/src/search/vespa.ts`, a swap of the compose `search` service image, and flipping `SEARCH_PROVIDER`. No call-site churn.

**Constrains / makes harder**
- The Tapestry pin is now a real piece of Unbnd's state. Updating Tapestry to absorb upstream fixes requires editing the pin file, rebuilding the image, and verifying nothing downstream broke. That's good discipline (we own when we adopt) but it's a process item.
- First-time setup adds two commands: `pnpm install`, `./scripts/build-tapestry-image.sh`, `docker compose up -d`. Documented in `docs/data-layer.md`.
- The image is large (Ubuntu base + Neo4j + JDK 17 + Node 22). First build is slow. We do not optimize this in cycle 2; image-size optimization is a deploy-time story if at all.

**Affects existing fixtures?** No. The fixture refit from story 1 stands.

**New dependencies in `apps/api`:**
- `neo4j-driver` — Neo4j bolt client. Same library Tapestry uses internally; standard.
- `ws` — WebSocket client for the strfry probe. Tiny, well-maintained.
- `vitest` (dev) — the workspace test runner. Authorized by ADR 0001; cycle 2 is the first apps/api consumer.

No HTTP client beyond Node 20+ built-in `fetch`.

**PRD section change required?** No.

## Implementation notes

### File layout

```
docker-compose.yml                                (new, repo root)
.env.example                                       (new, repo root)
.gitignore                                         (modify: add .env, .cache/)
scripts/
├── build-tapestry-image.sh                       (new)
├── generate-keypair.js                           (new)
└── tapestry-version.txt                          (new — pin file)
docs/
└── data-layer.md                                 (new)
apps/api/
├── package.json                                  (modify — new deps + test script)
├── tsconfig.json                                 (modify — include test dir)
├── vitest.config.ts                              (new)
└── src/
    ├── index.ts                                  (modify — wire config + routes)
    ├── config.ts                                 (new — env validation)
    ├── routes/
    │   ├── health.ts                             (new — /health and /health/data)
    │   └── index.ts                              (new — barrel)
    ├── probes/
    │   ├── strfry.ts                             (new)
    │   ├── neo4j.ts                              (new)
    │   ├── tapestry.ts                           (new)
    │   └── timeout.ts                            (new — shared 3s race helper)
    └── search/
        ├── SearchProvider.ts                     (new — interface)
        ├── meili.ts                              (new — impl, health() only)
        └── index.ts                              (new — resolveProvider() factory)
apps/api/test/                                    (new)
├── config.test.ts
├── probes/
│   └── timeout.test.ts
├── search/
│   └── meili.test.ts
└── routes/
    └── health.test.ts                            (uses light HTTP mock; no real services)
```

### `docker-compose.yml`

```yaml
services:
  tapestry:
    container_name: unbnd-tapestry
    image: unbnd/tapestry-data-layer:latest
    ports:
      - "8080:80"      # Tapestry Express API
      - "7777:7777"    # strfry relay
      - "7474:7474"    # Neo4j browser
      - "7687:7687"    # Neo4j bolt
    environment:
      - OWNER_PUBKEY=${OWNER_PUBKEY}
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - DOMAIN_NAME=localhost
    volumes:
      - unbnd-neo4j:/var/lib/neo4j/data
      - unbnd-strfry:/var/lib/strfry
      - unbnd-tapestry-data:/var/lib/brainstorm
    restart: unless-stopped

  search:
    container_name: unbnd-search
    image: getmeili/meilisearch:v1.10
    ports:
      - "7700:7700"
    environment:
      - MEILI_MASTER_KEY=${SEARCH_API_KEY}
      - MEILI_ENV=development
      - MEILI_NO_ANALYTICS=true
    volumes:
      - unbnd-search:/meili_data
    restart: unless-stopped

volumes:
  unbnd-neo4j:
  unbnd-strfry:
  unbnd-tapestry-data:
  unbnd-search:
```

Note: the Tapestry container's internal Meilisearch env var name is `MEILI_MASTER_KEY` (per Meili's docs) but the *Unbnd* env var that gets passed in is `SEARCH_API_KEY` — the renaming happens at the compose-env mapping, so the rest of Unbnd's codebase only ever sees the generic name.

### `.env.example`

```
# Tapestry container — relay-level admin key. Generate with:
#   node scripts/generate-keypair.js
# Then paste the hex pubkey here. The nsec is yours; do not commit it.
OWNER_PUBKEY=

# Neo4j password — choose any strong value for dev. Production uses a secret manager.
NEO4J_PASSWORD=tapestry-local-dev

# Search service master key. Choose any strong dev value; rotate per environment.
SEARCH_API_KEY=local-dev-search-key

# Provider discriminator. `meili` today; `vespa` when we swap.
SEARCH_PROVIDER=meili

# Data-layer URLs as seen from apps/api running on the host.
STRFRY_URL=ws://localhost:7777
NEO4J_BOLT_URL=bolt://localhost:7687
NEO4J_USER=neo4j
TAPESTRY_API_URL=http://localhost:8080
SEARCH_URL=http://localhost:7700
```

### `scripts/tapestry-version.txt`

```
# branch
concept-graph
# commit SHA (full)
6a9391fdd0114930a52f42f0b4196692bfcf1b22
```

Two non-comment lines so the script can `head -n 1` style parse without YAML.

### `scripts/build-tapestry-image.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN_FILE="${REPO_ROOT}/scripts/tapestry-version.txt"
SRC_DIR="${TAPESTRY_SRC:-${HOME}/.cache/unbnd/tapestry-src}"
REPO_URL="https://github.com/nous-clawds4/tapestry.git"

# Parse pin file (lines starting with # are comments; first non-comment line is branch, second is SHA).
mapfile -t LINES < <(grep -vE '^[[:space:]]*#' "$PIN_FILE" | grep -vE '^[[:space:]]*$')
BRANCH="${LINES[0]}"
COMMIT="${LINES[1]}"
SHORT="${COMMIT:0:8}"

echo "→ Tapestry pin: ${BRANCH} @ ${COMMIT}"
echo "→ Source dir: ${SRC_DIR}"

if [[ -d "${SRC_DIR}/.git" ]]; then
  echo "→ Updating existing clone…"
  git -C "${SRC_DIR}" fetch origin "${BRANCH}" --depth=50
  git -C "${SRC_DIR}" reset --hard "${COMMIT}"
else
  echo "→ Cloning fresh…"
  mkdir -p "$(dirname "${SRC_DIR}")"
  git clone --branch "${BRANCH}" --depth=50 "${REPO_URL}" "${SRC_DIR}"
  git -C "${SRC_DIR}" reset --hard "${COMMIT}"
fi

echo "→ Building image…"
docker build \
  --label "org.unbnd.tapestry-commit=${COMMIT}" \
  --label "org.unbnd.tapestry-branch=${BRANCH}" \
  -t "unbnd/tapestry-data-layer:latest" \
  -t "unbnd/tapestry-data-layer:${SHORT}" \
  "${SRC_DIR}"

echo "✓ Built unbnd/tapestry-data-layer:latest (${SHORT})"
```

### `apps/api/src/config.ts`

Hand-rolled validation. No `zod`. Pattern:

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`config: missing required env var ${name}`);
  }
  return v;
}
function urlWithDefault(name: string, def: string): string { /* ... */ }

export const config = {
  port: Number(process.env.PORT ?? 8787),
  strfryUrl: urlWithDefault("STRFRY_URL", "ws://localhost:7777"),
  neo4jBoltUrl: urlWithDefault("NEO4J_BOLT_URL", "bolt://localhost:7687"),
  neo4jUser: process.env.NEO4J_USER ?? "neo4j",
  neo4jPassword: required("NEO4J_PASSWORD"),
  tapestryApiUrl: urlWithDefault("TAPESTRY_API_URL", "http://localhost:8080"),
  searchUrl: urlWithDefault("SEARCH_URL", "http://localhost:7700"),
  searchApiKey: required("SEARCH_API_KEY"),
  searchProvider: (process.env.SEARCH_PROVIDER ?? "meili") as "meili" | "vespa",
};
export type Config = typeof config;
```

`config` is module-level singleton resolved at first import. Throws on missing required vars at startup.

### `apps/api/src/search/SearchProvider.ts`

```ts
export type ProviderHealth = {
  readonly ok: boolean;
  readonly provider: "meili" | "vespa";
  readonly version?: string;
  readonly error?: string;
};

export interface SearchProvider {
  readonly name: "meili" | "vespa";
  health(): Promise<ProviderHealth>;
  // Phase 2 in the search-wiring story:
  //   index(doc: BookSearchDoc): Promise<void>;
  //   search(query: string, filters?: SearchFilters): Promise<SearchResults>;
  //   delete(id: string): Promise<void>;
}
```

`apps/api/src/search/index.ts` exports a `resolveProvider(config: Config): SearchProvider` factory that picks `meili.ts` when `config.searchProvider === "meili"`. Throws on unknown providers; the future Vespa addition adds one case.

### `apps/api/src/probes/*`

Each probe is an async function that accepts the config plus a `signal: AbortSignal` and returns a `ProbeResult` (`{ ok: boolean; error?: string; latencyMs?: number }`). The 3-second timeout is enforced via `apps/api/src/probes/timeout.ts` (a small `Promise.race` helper that respects `AbortSignal`).

- `strfry.ts` opens a WebSocket to `config.strfryUrl`, waits for `open` event or error, closes immediately.
- `neo4j.ts` uses `neo4j-driver` to create a driver, run `RETURN 1`, then close. Driver creation is lazy (per-request) to avoid keeping a pool open.
- `tapestry.ts` does `fetch(\`${config.tapestryApiUrl}/api/health\`)`. If 200, ok. If 404, falls back to `fetch(config.tapestryApiUrl)` and accepts any 2xx.

### `apps/api/src/routes/health.ts`

```ts
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "unbnd-api", time: new Date().toISOString() });
});

router.get("/health/data", async (_req, res) => {
  const [strfry, neo4j, tapestry, search] = await Promise.allSettled([
    probeStrfry(config),
    probeNeo4j(config),
    probeTapestry(config),
    provider.health(),
  ]);
  const result = {
    ok: [strfry, neo4j, tapestry, search].every(p => p.status === "fulfilled" && p.value.ok),
    services: {
      strfry: settledTo(strfry),
      neo4j: settledTo(neo4j),
      tapestry: settledTo(tapestry),
      search: settledTo(search),
    },
  };
  res.status(result.ok ? 200 : 503).json(result);
});
```

503 on any-probe-failure so external monitors can detect outages without parsing JSON.

### `docs/data-layer.md`

Sections: prerequisites, one-time setup (generate keypair, populate .env, build image), start/stop/reset, health check, env-var reference, swapping search providers (forward reference to the search-wiring story).

## Out of scope

- Apps/api containerization. Dev stays on host; prod compose is a deploy-time story.
- TLS / nginx reverse proxy in front of the Tapestry container.
- Image size optimization. The Ubuntu-base image is heavy; we accept that for dev.
- Multi-environment env handling (`.env.local`, `.env.staging`, etc.). One `.env` for dev; deploy story handles environments.
- Authentication on `/health/data`. Unauthenticated for dev; admin token is a deploy-time concern.
- The full `SearchProvider` interface beyond `health()`. `index`, `search`, `delete` come with the search-wiring story.
- The Open Library catalog import.
- The Unbnd Librarian keypair generation (distinct from the relay OWNER_PUBKEY).
- Any UI work in `apps/web`. The /health/data response is intentionally not surfaced in the UI; that's a Settings → Diagnostics page in a later story.
- Provisioning the Meilisearch index (which fields are searchable, filterable, sortable). Story 3 territory.
- The OWNER_PUBKEY's matching nsec storage / key management. The developer holds the nsec locally; production secret management is a deploy story.

## Deferred concerns — captured here so the next story finds them

**Production hardening of `/health/data`.** The dev endpoint returns service names plus reachability. A production deployment should put it behind an admin token (or surface only to the load balancer) since rapid probing could be a soft DoS vector against Neo4j. Deploy-time story.

**Image size and build time.** The Ubuntu base + Neo4j + JDK + Node combine to a heavy image (likely 2-3 GB). First build is in the 10-20 minute range. Cycle 2 accepts both. A "slim production image" story may revisit using a distroless base for some layers; not worth the complexity now.

**GrapeRank tuning.** The Tapestry container's GrapeRank runs with Tapestry's default config. When Unbnd needs to weight book ratings differently (or compute personalized PoV for a specific user), tuning becomes a real concern. Separate story tied to the personalization-flow work.

**The full `SearchProvider` interface.** This story declares `health()` only. The next story to add a search dependency expands the interface and ships the Meili impl for the new methods. The Vespa migration becomes possible once `index` / `search` / `delete` exist and have tests.

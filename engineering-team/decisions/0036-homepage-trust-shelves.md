# ADR 0036: Homepage trust shelves — least-privilege scheduled worker + Postgres cache, honest non-trust fallback

**Status:** Proposed
**Date:** 2026-06-02
**Story:** `engineering-team/stories/35-homepage-trust-shelves.md`

## Context

The homepage (`apps/web/src/routes/Home.tsx`) today renders a `Hero`, a `PoVBar`, a single raw
**"Recently added"** `Shelf` (`api.books.recent(18)` → `GET /api/books?limit=18`, newest-first by
`created_at`) and an **"Explore genres"** `GenreGrid` (taxonomy from `api.tags.list()` filtered to
`type === "genre"`). Neither is trust-aware. PRD §2.9 (the shelves half) requires three
**trust-weighted** shelves — **Trending**, **Community Favorites**, and **genre shelves** — that are
**"cached and refreshed on a schedule, not per-request"** with **"honest empty states"**, verified
against the fixture provider in CI. Story 34 (ADR 0035) shipped the §2.9 *search* half; the For-You
personalized shelf is Story 36 and is OUT here. These shelves are **house-PoV only**.

The trust math is **not new**. Each shelf's signal is the existing trust-weighted view:
`weightedRatings(deduped, weights, observerNpub)` (`apps/api/src/ratings/summary.ts`, ADR 0014/0025),
which weights raters with weight > 0 from an observer's vantage and returns **null** when no rater
carries positive weight (the honest "no trusted signal from this view"). The observer is the **house**
vantage (`config.houseObserverPubkey`, interim `DEFAULT_HOUSE_OBSERVER` = nosfabrica), resolved
exactly as the ratings/tags/search reads resolve it. Weights come from the `TrustProvider.weights`
seam (`apps/api/src/trust/{types,fixture,index,brainstorm}.ts`), which **never throws** (empty map on
backend failure). The candidate sets are the existing reads: catalog book records (kind-39999
z-tagged to `buildBookRecordsHeaderAddress(lib)`), the per-book ratings (kind-39999 z-tagged to
`buildBookRatingsHeaderAddress(lib)`, `#a`-linked to each book address), the genre taxonomy
(`book-tags` concept, `type === "genre"`), and per-genre membership (`aggregateGenreBooks` over
`book-tag-assertions`, the net-positive consensus behind `GET /api/genres/:slug/books`).

**The "scheduled, not per-request" requirement + CLAUDE.md invariant 3.** CLAUDE.md §3 warns against
"compute the trust-weighted score once and cache it" because the answer changes per-POV and per-new-
rating. These shelves are the **§2.9-sanctioned exception**: they are **one POV** (house), so there is
no per-POV combinatorial cache, and §2.9 itself mandates a scheduled cache whose **refresh cadence is
the invalidation story**. This ADR records that as a deliberate, bounded denormalization — the cache
holds **house-PoV-only** shelves; the canonical data (the rating/tag/book events on the relay) is never
the cache and is never mutated.

**Constraints carried in:** no new ranking/trust math beyond `weightedRatings`; no raw GrapeRank
number / tier / "trusted" badge on any shelf card (CLAUDE.md; shelves only select + order books); no
new crypto (this reads weights and composes a view — it signs nothing); built/verified against the
**fixture `TrustProvider`** (ADR 0017) with no Brainstorm, no relay, no human; no new homepage layout
(reuse `Shelf`/`BookCard`/`BookGrid`/`GenreGrid`); brand tokens unchanged (no new hex outside
`tokens.css`); copy reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

**Gate decisions (2026-06-02), baked in:** (1) a **scheduled worker + Postgres cache** (NOT an
API-side TTL cache); (2) **honest non-trust fallback sections** on the homepage ("Recently added"
recency shelf + "Explore genres" grid kept, honestly labeled as non-trust) so the page is never a
blank wall, while every TRUST shelf stays honestly empty until signal arrives; (3) **house-PoV only**;
(4) a **least-privilege worker** that holds **no `LIBRARIAN_NSEC`** (it computes + caches, it never
signs).

**Prior art surveyed.** This is not DList-shaped (it writes no events), so the relevant prior art is
the codebase's own off-path-worker pattern:
- `apps/indexer` (ADR 0013) — a `restart:"no"`, `profiles:["index"]` worker that reads the **whole
  catalog** off the local relay (`queryAllPages` past the strfry per-REQ cap, ADR 0021) and writes a
  derived store. It holds **no librarian key** — the closest analog for this worker.
- `apps/promoter` (ADR 0031/0034) — the off-path **cron + Postgres queue** pattern (`createQueue`,
  `FOR UPDATE SKIP LOCKED`), but it **holds `LIBRARIAN_NSEC`** because it signs. We crib its
  cron/compose/migration shape but explicitly **do not** give the shelves worker the key.
- `apps/api/src/db/migrations.ts` — idempotent `IF NOT EXISTS` migrations run on startup (`0001`–
  `0004`); the next number is `0005`.
- `ops/cron/unbnd-upsync` — the droplet cron install pattern.

## Options considered

### Option A — A new least-privilege `apps/shelves` worker + cron + a Postgres cache table the API serves (CHOSEN)

A new run-once worker (`apps/shelves`, modeled on `apps/indexer`) fired by an operator cron. Each run:
reads the catalog + ratings + genre membership off the local relay (`queryAllPages`), resolves the
house observer's weights via **one bounded, batched** `trust.weights(house, allRaterHexes)` call,
computes the three shelves with `weightedRatings`, and **replaces** the rows in a new
`homepage_shelves` Postgres table. A new `GET /api/homepage/shelves` route reads that table and
hydrates slugs via the existing book read. The worker carries `DATABASE_URL`, `STRFRY_URL`, the trust
config, and the librarian **pubkey** — but **never `LIBRARIAN_NSEC`** (it signs nothing).

- **Pros.** Cost is fully off the hot path — no Reader ever pays the trust+windowed-rating compute;
  the homepage (most-seen page) never goes slow. Reuses the proven indexer/promoter/migration/cron
  patterns. The cache has a clear invalidation story (the refresh cadence), honoring CLAUDE.md §3.
  Least-privilege: the new attack surface holds no signing key. Deterministic + fixture-testable: the
  compute is a pure function of (catalog, ratings, weights), tested with fakes.
- **Cons.** Adds a new app + Dockerfile + GHCR build-matrix row + compose profile + a droplet cron
  install step + a migration. More moving parts than a TTL cache.

### Option B — An API-side TTL cache (compute on first request after expiry, serve cached otherwise)

No new worker/cron. The `/api/homepage/shelves` route computes the shelves on the first request after
the TTL expires and serves the memoized result until the next expiry.

- **Pros.** Simplest — no new app, no cron, no migration, no GHCR row.
- **Cons.** The **first post-expiry homepage load pays the full compute** (catalog scan + windowed
  rating dedup + the batched weights call) on the hot path — exactly the page we least want slow, and
  the page with the most concurrent first-hits (a thundering-herd risk at expiry). An in-process TTL
  also does not survive a restart and is per-replica (inconsistent across API instances). Rejected by
  the gate: it violates the "never make a Reader wait" intent even though it technically satisfies
  "not per-request."

### Option C — Fold the compute into `apps/indexer`

The indexer already reads the whole catalog; add the shelf compute + cache write as a second output of
the same run.

- **Pros.** No new app; reuses the catalog read it already does.
- **Cons.** Conflates two concerns on one cadence — the search index and the trust shelves have
  different refresh needs (the index reflects catalog membership; shelves reflect trust-weighted
  rating activity in a rolling window), and coupling them forces one schedule and one failure domain
  (a shelves-compute error would fail the search index run, or vice versa). The indexer also doesn't
  touch Postgres or the trust seam today; folding both in bloats its dependency surface. Cleaner to
  keep a single-responsibility worker. Rejected on separation-of-concerns; the indexer stays a search
  indexer.

### Option D — Extend `apps/promoter`

- **Cons.** The promoter **holds `LIBRARIAN_NSEC`**. Adding a non-signing compute to a key-holding
  worker widens what runs in the most-privileged process for no benefit, against least-privilege.
  Explicitly rejected per the gate. The shelves worker must be key-free.

## Decision

We chose **Option A**: a new **least-privilege `apps/shelves` worker** fired by an operator cron that
computes the house-PoV trust shelves off the hot path and **replaces** rows in a `homepage_shelves`
Postgres cache table; a new **`GET /api/homepage/shelves`** route serves the cached rows (never
computes on a request) and hydrates book slugs via the existing batch read; the homepage renders the
trust shelves (honest-empty when none) **plus** the kept, honestly-labeled non-trust fallback sections.

### 1. The shelves worker (`apps/shelves`, least-privilege, no librarian key)

Modeled on `apps/indexer/src/{index,relay}.ts`. Structure: `src/main.ts` (runtime entrypoint — wires
real deps, runs ONE cycle, exits, like `apps/promoter/src/main.ts`), `src/compute.ts` (the pure
compute — exported as `computeShelves(deps): ShelfSet` so tests import it without executing anything),
`src/relay.ts` (re-use the indexer's `queryRelay`/`queryAllPages`), `src/cache.ts` (the Postgres
writer, plain `postgres` like `apps/promoter/src/queue.ts` — no drizzle in the worker). A
`Dockerfile` + `esbuild.config.mjs` mirroring the indexer.

**Per cycle:**
1. Resolve `LIBRARIAN_PUBKEY` (hex, runtime — never hardcoded, CLAUDE.md), the house observer
   (`HOUSE_OBSERVER_PUBKEY` / `DEFAULT_HOUSE_OBSERVER`), and the trust provider (`resolveTrustProvider`
   from `@unbnd/trust`, selected by `TRUST_PROVIDER` + `TRUST_FIXTURE`).
2. Read, each via `queryAllPages` (cap-safe, ADR 0021): the catalog book records
   (`buildBookRecordsHeaderAddress`), all ratings (`buildBookRatingsHeaderAddress`), the genre taxonomy
   (`buildBookTagsHeaderAddress`, keep `type==="genre"`), and the genre membership assertions
   (`buildBookTagAssertionsHeaderAddress`).
3. Dedup ratings per (rater, book) with the existing `dedupeRatings` (or its windowed variant — see §4),
   grouped by book address / `bookSlug`.
4. **Bounded, batched weights (AC-7):** collect the **union of all rater hexes** across the candidate
   books into one deduped array and call `trust.weights(house, allRaterHexes)` **once** (the worker
   may chunk that single union into fixed-size batches — e.g. 500 hexes/call — if the rater set grows
   large, unioned into one `Map`; this keeps the trust read **O(distinct raters)**, never O(books ×
   raters), mirroring how the ratings/tags routes batch one `weights` call per read). No per-book
   per-rater fan-out.
5. Compute the three shelves from that single weights map (§4), each via `weightedRatings`.
6. **Replace** the cache: write the computed shelves to `homepage_shelves` in one transaction
   (delete-all-then-insert, or `TRUNCATE`+insert, scoped to the house observer row-set) with a single
   `computed_at`. A shelf with no qualifying book writes **zero rows** for that kind (honest empty).

**Least-privilege env (NO `LIBRARIAN_NSEC`):** `DATABASE_URL`, `STRFRY_URL`, `LIBRARIAN_PUBKEY`,
`HOUSE_OBSERVER_PUBKEY` (optional; defaulted), `TRUST_PROVIDER`, `TRUST_FIXTURE` (fixture mode),
`BRAINSTORM_API_URL` / `TRUST_RELAYS` (brainstorm mode), and the shelf-definition envs (§4). It holds
the librarian **pubkey** (an `authors:`/concept-handle filter, public) but never the secret. It does
not import any signer and publishes nothing.

**Compose (`docker-compose.prod.yml`), mirroring `indexer`:**
```yaml
  shelves:
    image: ghcr.io/aburra16/unbnd-shelves:${UNBND_IMAGE_TAG:-latest}
    profiles: ["shelves"]      # never starts with the normal stack
    environment:
      - DATABASE_URL=postgres://unbnd:${POSTGRES_PASSWORD}@db:5432/unbnd
      - STRFRY_URL=ws://tapestry/relay
      - LIBRARIAN_PUBKEY=${LIBRARIAN_PUBKEY}
      - HOUSE_OBSERVER_PUBKEY=${HOUSE_OBSERVER_PUBKEY:-}
      - TRUST_PROVIDER=${TRUST_PROVIDER:-brainstorm}
      - BRAINSTORM_API_URL=${BRAINSTORM_API_URL:-}
      - TRUST_RELAYS=${TRUST_RELAYS:-}
      # shelf-definition knobs (§4)
      - SHELF_TRENDING_WINDOW_DAYS=${SHELF_TRENDING_WINDOW_DAYS:-7}
      - SHELF_FAVORITES_MIN_RATINGS=${SHELF_FAVORITES_MIN_RATINGS:-3}
      - SHELF_GENRE_COUNT=${SHELF_GENRE_COUNT:-5}
      - SHELF_BOOKS_PER_ROW=${SHELF_BOOKS_PER_ROW:-10}
    depends_on:
      db: { condition: service_healthy }
      tapestry: { condition: service_started }
    restart: "no"
```
Note: **no `LIBRARIAN_NSEC`** (contrast the `promoter` block, which has it).

**Cron (`ops/cron/unbnd-shelves`, mirroring `unbnd-upsync`):** hourly default, configurable.
```
0 * * * * root docker compose -f /opt/unbnd/docker-compose.prod.yml --profile shelves run --rm shelves >> /var/log/unbnd-shelves.log 2>&1
```
**Refresh cadence = hourly default** (the invalidation story for invariant 3); the operator changes
the cron line to retune. (`unbnd-upsync` is a `strfry exec`; the worker is a one-shot `compose run`
like a manual promote, fired on a schedule.)

### 2. The cache schema + migration (`0005_homepage_shelves`)

A new idempotent migration in `apps/api/src/db/migrations.ts`, next number `0005`:
```sql
CREATE TABLE IF NOT EXISTS homepage_shelves (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observer_hex CHAR(64) NOT NULL,                 -- the house observer this row was computed FROM
  kind         TEXT NOT NULL,                     -- 'trending' | 'favorites' | 'genre:<slug>'
  position     INTEGER NOT NULL,                  -- 0-based order within the shelf
  book_slug    TEXT NOT NULL,                     -- the API hydrates display fields; cache stores slugs
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (observer_hex, kind, position)
);
CREATE INDEX IF NOT EXISTS idx_homepage_shelves_kind ON homepage_shelves(observer_hex, kind, position);
```
**Shape rationale.** The cache stores only **ordered slugs** (+ `kind`, `position`, `observer_hex`,
`computed_at`), **not** denormalized book display fields — the API hydrates titles/covers/authors
through the existing `parseBook` read so cover/title edits (author overlays, ADR 0033) are never stale
in a shelf. `kind` is `trending`, `favorites`, or `genre:<slug>` (one row-set per surfaced genre).
`observer_hex` is recorded so the table is honest about whose vantage it holds (house only today; it
also future-proofs the swap to the production librarian without a schema change). **Upsert/replace
shape:** the worker does a full **replace per refresh** inside one transaction (delete the observer's
rows, insert the new set, all sharing one `computed_at`) — a refresh is atomic; a Reader never sees a
half-written shelf set. An empty shelf = zero rows for that `kind` (honest empty by absence).

**Invariant-3 exception, recorded.** This is the **only** per-POV denormalization in the codebase and
it is deliberately bounded: **one POV** (house → no N-POV combinatorial blowup), **scheduled refresh**
as the clear invalidation story, and **canonical data is never the cache** (the relay events are the
source of truth; this table is a disposable, fully-recomputable view). Per-user vantage stays at
read-time (Story 36 / For-You) and is explicitly OUT.

### 3. The serve-from-cache API (`GET /api/homepage/shelves`)

A new read-only, public route (a `buildHomepageShelvesRouter(deps)` in `apps/api/src/routes/`,
registered in the API server wiring next to the books/tags routers). It is named `homepage/shelves`
to avoid colliding with the existing **user-shelf** namespace (`/api/shelves/*`, ADR 0018, surfaced as
`api.shelves.*` in the web client). It:
1. Reads `homepage_shelves` rows for the configured house observer, grouped by `kind`, ordered by
   `position`.
2. Collects the distinct `book_slug`s across all shelves and hydrates them in **one** batch via the
   existing slug-batch read (`GET /api/books?slugs=` path / `parseBook`), preserving per-shelf order
   and dropping any slug that no longer resolves.
3. **Never computes** — if the cache is empty/absent (worker not yet run, or every shelf honest-empty),
   it returns empty shelves. It never reads the relay for ratings/weights on the request path.

**Response shape (honest-empty by empty arrays):**
```jsonc
{
  "computedAt": "2026-06-02T10:00:00Z" | null,   // null when the cache is empty
  "trending":  { "books": PublicBook[] },         // [] = honest empty
  "favorites": { "books": PublicBook[] },
  "genres": [ { "slug": "sci-fi", "name": "Science Fiction", "books": PublicBook[] }, ... ]
}
```
No trust score / tier / "trusted" flag appears anywhere in the response (CLAUDE.md — shelves only order
books). The web client gains `api.homepage.shelves()` in `apps/web/src/lib/api.ts`.

### 4. Shelf definitions (env-configurable; names + defaults pinned)

All over the existing `weightedRatings` view from the **house** vantage; no new scoring math.

- **Trending** — ranked by the **weighted sum of trusted ratings in a recent window**. The worker
  filters each book's deduped ratings to those with `createdAt ≥ now − SHELF_TRENDING_WINDOW_DAYS·86400`,
  then ranks by `Σ (weight × score)` over raters with weight > 0 (untrusted raters contribute 0, so
  bot/throwaway volume cannot push a book onto the shelf — spam-resistance by trust weighting, not a
  heuristic). Books with no in-window trusted rating do not appear. Env **`SHELF_TRENDING_WINDOW_DAYS`**,
  **default 7** (per §2.9). (A recency tilt within the window is a permitted refinement, left to the
  Implementer; the AC requires only that untrusted volume can't push a book on and trusted activity
  drives the order.)
- **Community Favorites** — ranked by **`weightedRatings.average`** across all genres, with a book
  qualifying **only** if `weightedRatings.trustedCount ≥ SHELF_FAVORITES_MIN_RATINGS`. Env
  **`SHELF_FAVORITES_MIN_RATINGS`**, **default 3** (a single trusted 5-star can't top the shelf;
  thinly-rated books are excluded, not surfaced). Books below the threshold are excluded.
- **Genre shelves** — for each surfaced genre (the taxonomy `type==="genre"` ∩ per-genre membership
  from `aggregateGenreBooks`), rank the genre's books by `weightedRatings.average` from the house
  vantage and take the top N. Env **`SHELF_GENRE_COUNT`** (how many genre rows on the homepage,
  **default 5**) × **`SHELF_BOOKS_PER_ROW`** (books per row, **default 10**). Which genres surface is
  the top `SHELF_GENRE_COUNT` genres by qualifying-book count (deterministic, tie-broken by slug). A
  genre with no trust-weighted signal across its books contributes **zero rows** (honest empty per §5),
  never raw/arbitrary books dressed as trust-ranked.

`SHELF_BOOKS_PER_ROW` also caps Trending and Favorites row length. All four envs are read by the
worker (the API only serves cached rows). Validation mirrors `config.ts` (`withDefault` + positive-
integer / positive-day checks); the worker fails its run loudly on a bad env rather than caching a
malformed shelf.

### 5. Honest empty + non-trust fallback (web — gate decision 2)

`Home.tsx` composes, in order:
1. `Hero`, `PoVBar` (unchanged).
2. The **trust shelves** from `api.homepage.shelves()`: render `Trending` and `Community Favorites`
   as `Shelf` rows **only when their `books` array is non-empty**; render each genre row as a `Shelf`
   only when non-empty. When a trust shelf is empty it is simply **absent** (or, if the Implementer
   prefers a labeled treatment, an honest "nothing here yet" line — copy reviewed against the no-slop
   rule). **No fabricated/filler/substitute books, ever** (AC-5).
3. The **kept non-trust fallback**, always present, clearly labeled as recency/browse (NOT trust-
   ranked): the existing **"Recently added"** `Shelf` (`api.books.recent`) and the **"Explore genres"**
   `GenreGrid` (`api.tags.list()`). These are honestly named — they are not presented as trust shelves.
4. `CallToAction`, `Footer` (unchanged).

On today's thin nosfabrica graph every trust shelf is empty, so the homepage shows the honest non-trust
fallback (Recently added + Explore genres) and no trust shelves — never a blank wall, never fabricated
trust content. As real trust signal arrives, the trust shelves appear above the fallback. Reuses
`Shelf`/`BookCard`/`BookGrid`/`GenreGrid` and existing tokens only; no new layout, no new hex, no new
icon library. Shelf titles ("Trending", "Community Favorites", per-genre names) and any empty/label
copy are reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

### 6. Honest degrade (AC-6)

- **Compute-time trust failure** (no observer, provider error, or `weights` → empty map): the
  `weightedRatings` calls return null for every candidate → the affected shelves compute to **empty**.
  The worker writes those shelves as **zero rows** (an honest empty shelf) and completes the
  transaction normally — it never writes a fabricated/raw shelf, and a trust error never crashes the
  cache into a bad/partial state (the replace is atomic; on a fatal error mid-compute the worker exits
  non-zero **before** the replace transaction, leaving the **previous** good cache intact rather than
  half-written).
- **Serve-time:** the API serves whatever the cache holds; empty is fine (honest empty). It never
  computes and never throws on a missing/empty cache (returns empty shelves, `computedAt: null`).
- **Homepage:** always renders — the non-trust fallback (§5) is unconditional, so a Reader always sees
  a usable page even when every trust shelf is empty and even if `/api/homepage/shelves` itself errors
  (the web treats a failed shelves fetch as "no trust shelves", same as empty).
- The `TrustProvider` seam never throws (its contract); the worker still wraps the `weights` call so a
  surprise rejection degrades to an empty map, exactly as the ratings/tags/search reads do.

### 7. Testable seams (fixture-verified; deterministic; no Brainstorm/relay/human)

- **Worker compute (`computeShelves`)** is a pure function of injected deps: a **fake relay read**
  (returns canned catalog/ratings/taxonomy/membership events), the **fixture `TrustProvider`**
  (`FixtureTrustProvider` with known house weights over known rater keys, ADR 0017), a **clock**
  (injected `now` so the Trending window is deterministic), and a **fake cache writer** (captures the
  rows that would be written — no real DB). Tests assert: Trending ordering + the window filter +
  spam-resistance (untrusted volume can't push a book on) (AC-1); Favorites `average` ordering + the
  `SHELF_FAVORITES_MIN_RATINGS` threshold excludes thinly-rated books (AC-2); per-genre top-N ordering
  and `SHELF_GENRE_COUNT`/`SHELF_BOOKS_PER_ROW` caps (AC-3); honest-empty (zero rows) when no book
  qualifies (AC-5); honest-degrade (empty weights → empty shelves, no throw, previous cache untouched
  on a fatal error) (AC-6); and the **bounded/batched** weights call — assert `trust.weights` is called
  **once** (or in fixed chunks) over the **union** of rater hexes, never per-book (AC-7).
- **API serve (`/api/homepage/shelves`)** tested with a **fake cache read** + a fake book-hydrate:
  asserts honest-empty (empty cache → empty arrays, `computedAt: null`), correct grouping/ordering by
  `kind`/`position`, slug hydration in order, dropped-unresolvable-slug handling, and that it makes
  **no** relay/trust call on the request path (serve-from-cache only) (AC-4).
- **Web homepage** tested with a **mocked `api.homepage.shelves()`**: trust shelves render when
  non-empty; absent when empty; the non-trust fallback (Recently added + Explore genres) renders in
  both cases; no trust score/tier/badge on any shelf card (AC-5).
- **CI (AC-8):** all of the above run under `TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE`,
  with no Brainstorm, no relay, no human. No Brainstorm/NIP-85 specifics leak outside
  `apps/api/src/trust/brainstorm.ts`; the ADR 0014 trust-architecture guard stays green (the worker
  depends only on the neutral `@unbnd/trust` surface, like the API).

## Consequences

- **Enables** trust-curated discovery on the most-seen page (Trending / Community Favorites / genre
  rows), computed off the hot path so no Reader ever waits, with honest empty states and an honest
  non-trust fallback so the page is never blank on the thin interim graph.
- **Constrains / makes harder:** adds a new deployable (`apps/shelves`) with its own Dockerfile, GHCR
  build-matrix row, compose profile, droplet cron install step, and a DB migration — more ops surface
  than a TTL cache. The shelves are **stale up to one refresh interval** (hourly default) by design;
  that staleness is the accepted §2.9 tradeoff and the invariant-3 invalidation story.
- **New debt / follow-ups:** the production house-observer swap (`HOUSE_OBSERVER_PUBKEY` → the prod
  librarian) is unchanged and out of scope here; the `observer_hex` column future-proofs it. Story 36
  (For-You) will add a per-user vantage — it must **not** extend this house cache into a per-POV cache
  (that would reintroduce the invariant-3 blowup); it computes at read time per CLAUDE.md §3.
- **Affects existing fixtures?** No existing fixtures change. New fixtures are added by the Tester
  (the fake-relay event set + a `TRUST_FIXTURE` with known house weights over known raters across
  genres in a known window). The `Home.tsx` test gains a mocked `api.homepage.shelves()`.
- **New dependency?** No. The worker reuses `postgres` (already a dep of the API/promoter), `ws` (the
  indexer's relay client), and `@unbnd/{schemas,trust}`. No new runtime package.
- **PRD section change required?** No. This implements PRD §2.9 (shelves half) as written.

## Implementation notes

- **New app `apps/shelves/`:** `package.json`, `Dockerfile`, `esbuild.config.mjs`, `tsconfig.json`,
  `vitest.config.ts` (all mirroring `apps/indexer`/`apps/promoter`); `src/main.ts` (entrypoint: env →
  deps → one `runShelvesCycle`, exit), `src/compute.ts` (`computeShelves(deps): ShelfSet` — the pure,
  tested core), `src/relay.ts` (reuse `queryRelay`/`queryAllPages`), `src/cache.ts`
  (`createShelvesCache(databaseUrl)` → `replaceShelves(observerHex, shelves)` via a single transaction,
  plain `postgres`). NO signer import; NO `LIBRARIAN_NSEC`.
- **`apps/api/src/db/migrations.ts`:** append the `0005_homepage_shelves` migration (§2).
- **`apps/api/src/routes/homepage-shelves.ts`** (new): `buildHomepageShelvesRouter(deps)` with
  `deps = { config, query, readShelfCache }`; register it in the API server wiring beside the
  books/tags routers. Read-only, public, serve-from-cache only.
- **`apps/api/src/config.ts`:** the shelf-definition envs live in the **worker**, not the API config.
  The API only needs the house observer (already present) to scope the cache read. No new API config
  field strictly required; if the serve route needs the observer it reuses `config.houseObserverPubkey`.
- **`apps/web/src/lib/api.ts`:** add an `api.homepage.shelves()` reader returning the §3 response
  shape (new `HomepageShelves` type). Keep the existing `api.shelves.*` (user shelves) untouched.
- **`apps/web/src/routes/Home.tsx`:** fetch `api.homepage.shelves()` alongside the existing
  recent/taxonomy reads; render trust shelves (empty → absent) above the kept non-trust fallback (§5).
- **Compose:** add the `shelves` service to `docker-compose.prod.yml` (and `docker-compose.yml` for
  local, profile `shelves`) per §1, with **no `LIBRARIAN_NSEC`**.
- **CI:** add a `shelves` row to the `.github/workflows/staging.yml` build matrix
  (`name: shelves`, `dockerfile: apps/shelves/Dockerfile`) → `ghcr.io/.../unbnd-shelves`.
- **Cron:** add `ops/cron/unbnd-shelves` (hourly default) per §1.
- **No DList shapes touched** — the worker reads existing kind-39998/39999 events and writes only the
  internal `homepage_shelves` Postgres cache. It signs and publishes nothing.

## Out of scope

- The For-You personalized shelf (Story 36) — no per-user vantage; this cache is house-PoV only and
  must not be extended into a per-POV cache.
- The trust-weighted search re-ranking (Story 34 / ADR 0035) — untouched.
- Index-on-write (Block E) — the worker reads the live catalog/genre/rating reads as they are.
- The production house-observer swap — the interim nosfabrica vantage stays; verified against the
  fixture provider regardless.
- Any new ranking/trust math beyond `weightedRatings`; any trust score/tier/badge on a shelf card; a
  homepage redesign; an admin "feature this book" affordance; new lint/build tooling.

# Test Plan: Story 35 — Homepage trust shelves

**Story:** `engineering-team/stories/35-homepage-trust-shelves.md`
**ADR:** `engineering-team/decisions/0036-homepage-trust-shelves.md`
**Date:** 2026-06-02

The shelves are the §2.9 SHELVES half: a least-privilege `apps/shelves` worker (NO
librarian key) computes house-PoV Trending / Community Favorites / genre shelves off the
hot path, atomically replaces a `homepage_shelves` Postgres cache, and a read-only
`GET /api/homepage/shelves` serves the cache (never computes). The homepage renders the
trust shelves (empty → absent) above an always-present, honestly-labeled non-trust
fallback. Everything is verified against the **fixture `TrustProvider`** — no Brainstorm,
no relay, no human.

All tests are fixture-driven and deterministic: the trust signal comes from a
`FixtureTrustProvider` with known house weights over known rater keys; the Trending window
is computed against an **injected `now`** (never wall time); the relay read, the cache
writer, and the cache read are **injected fakes** (no live relay/DB). No intra-module
`vi.mock` in the worker/serve units — pure DI, mirroring the ratings/search/indexer tests.
The web component test stubs the api **client** (the documented component-test approach,
CLAUDE.md "stub the API client"), not a module under test.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 Trending | `ranks books by the weighted sum of TRUSTED ratings inside SHELF_TRENDING_WINDOW_DAYS` | `apps/shelves/test/compute.test.ts` | unit |
| AC-1 (window) | `excludes a book whose only trusted rating is OUTSIDE the window` | `apps/shelves/test/compute.test.ts` | unit |
| AC-1 (spam) | `an UNTRUSTED-rating flood does NOT inflate a book onto Trending` | `apps/shelves/test/compute.test.ts` | unit |
| AC-2 Favorites | `ranks by weightedRatings.average and excludes books below SHELF_FAVORITES_MIN_RATINGS` | `apps/shelves/test/compute.test.ts` | unit |
| AC-2 (order) | `orders two qualifying books by their trust-weighted average (higher first)` | `apps/shelves/test/compute.test.ts` | unit |
| AC-3 Genre | `ranks each genre's books by trust-weighted average from the house vantage` | `apps/shelves/test/compute.test.ts` | unit |
| AC-3 (honest empty genre) | `a genre with NO trust signal is honest-empty (NOT filled with raw books)` | `apps/shelves/test/compute.test.ts` | unit |
| AC-3 (caps) | `surfaces at most SHELF_GENRE_COUNT genres and SHELF_BOOKS_PER_ROW books per row` | `apps/shelves/test/compute.test.ts` | unit |
| AC-7 batched | `calls trust.weights EXACTLY ONCE over the union of all raters` | `apps/shelves/test/compute.test.ts` | unit |
| AC-7 house-PoV | `computes the house-PoV signal from config.houseObserverPubkey` | `apps/shelves/test/compute.test.ts` | unit |
| AC-6 degrade | `an empty weight map yields empty shelves (no trusted signal anywhere)` | `apps/shelves/test/compute.test.ts` | unit |
| AC-6 degrade | `a throwing trust.weights degrades to empty shelves and does NOT throw` | `apps/shelves/test/compute.test.ts` | unit |
| AC-6 degrade | `no house observer configured yields empty shelves (honest no-vantage)` | `apps/shelves/test/compute.test.ts` | unit |
| AC-6 atomic | `does NOT call the cache writer when the relay read throws mid-compute` | `apps/shelves/test/compute.test.ts` | unit |
| AC-4 cache write | `writes the computed set in ONE atomic replace on a clean run` | `apps/shelves/test/compute.test.ts` | unit |
| AC-4 cache schema | `0005_homepage_shelves` table shape + `UNIQUE(observer_hex,kind,position)` | `apps/api/test/db/migrations-homepage-shelves.test.ts` | unit |
| AC-1/2/3 config | `SHELF_* defaults 7/3/5/10, overrides, positive-int validation` | `apps/shelves/test/config.test.ts` | unit |
| AC-4 serve / honest-empty | `returns empty arrays and computedAt:null when no rows are cached` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-3/AC-4 serve hydrate | `groups by kind, orders by position, and hydrates each slug to a PublicBook` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-4 serve hydrate | `drops a cached slug that no longer resolves to a catalog book` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-4 never-computes | `makes no relay rating/weights read and no trust call when serving` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-7 serve batched | `hydrates ALL shelves' slugs in a single batched book read (one #d query)` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-5 no-trust-on-wire | `returns only book display fields, never a trust number/tier/'trusted' flag` | `apps/api/test/routes/homepage-shelves.test.ts` | route |
| AC-1/2/3 web render | `renders Trending and Community Favorites when the cache has books` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-3 web render | `renders a genre shelf row from the cached genres` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-5 web honest-empty | `does not render a Trending shelf header when trending is empty` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-5 web honest-empty | `renders NO trust shelves when every trust shelf is empty (no fabrication)` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-5 fallback | `always renders 'Recently added' (recency) and 'Explore genres' (browse)` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-5 fallback | `keeps the non-trust fallback even when trust shelves are populated` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-6 web degrade | `still renders the page when the shelves fetch fails (treated as no trust shelves)` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-5 no-tier-on-card | `renders trust-shelf book cards with no GrapeRank number or tier string` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-8 guard | `the worker source carries no Brainstorm/NIP-85 specifics` | `apps/shelves/test/architecture.test.ts` | guard |

AC-8 (built/verified against the fixture provider in CI) is satisfied transitively: every
test above runs under the `FixtureTrustProvider` with no Brainstorm, no relay, no human; the
worker-scoped architecture guard pins the no-Brainstorm-leak invariant; the repo-wide ADR
0014 guard (`apps/api/test/trust/architecture.test.ts`) already scans `apps/` and now covers
`apps/shelves` too.

## How the load-bearing behaviors are asserted

- **The 3 shelf definitions.** Trending = ranked by Σ(weight × score) over **trusted** raters
  whose rating `created_at ≥ now − SHELF_TRENDING_WINDOW_DAYS·86400` (injected `now`); an
  out-of-window trusted rating is excluded; a 10-rating untrusted flood (zero weight) never
  pushes a book onto the shelf, while one trusted recent rating does. Community Favorites =
  ranked by `weightedRatings.average`, qualifying only at `trustedCount ≥
  SHELF_FAVORITES_MIN_RATINGS` (default 3) so a single trusted 5 is excluded. Genre shelves =
  per surfaced genre, the genre's member books (taxonomy `type==="genre"` ∩ `aggregateGenreBooks`
  membership) ranked by `weightedRatings.average`, capped at `SHELF_GENRE_COUNT` genres ×
  `SHELF_BOOKS_PER_ROW` books; a genre with no trusted signal contributes zero rows.
- **Single batched weights (AC-7).** A `vi.spyOn(trust, "weights")` asserts `toHaveBeenCalledTimes(1)`,
  the first arg is exactly the house observer hex, and the second arg is the **union** of every
  rater across every candidate book (sorted-equal) — never per-book, never per-genre.
- **Degrade without crash (AC-6).** Empty weight map, a rejecting `weights`, and a missing house
  observer each resolve to empty shelves with no throw. The atomic-replace guarantee is asserted
  by a relay-read-throws case: `runShelvesCycle` rejects and the cache writer is **never called**
  (no partial/garbage set; the prior good cache is left intact). The clean-run case asserts the
  writer is called exactly once for the house observer (replace-per-refresh).
- **Serve never computes (AC-4).** The route test wires a `FixtureTrustProvider` into deps and a
  fake hydrate `query`, then asserts the trust seam is **never called** on a serve request, no
  `#a` rating read is issued (only the `#d` slug hydrate), and the whole shelf set hydrates in a
  **single** batched `#d` book read over the union of distinct slugs.
- **Honest-empty + non-trust fallback.** Serve: an empty cache returns `{computedAt:null, trending:{books:[]},
  favorites:{books:[]}, genres:[]}`. Web: an empty trust shelf is **absent** (no header, no filler);
  the "Recently added" recency shelf and "Explore genres" browse grid are present in BOTH the
  empty and populated cases and stay labeled as recency/browse (never trust-ranked); a failed
  `api.homepage.shelves()` fetch degrades to the fallback (no blank wall, no throw). No
  GrapeRank/tier/"trusted" text appears on a shelf card or anywhere on the wire.

## Edge cases

- [x] Empty input / empty cache (honest empty, `computedAt: null`).
- [x] Out-of-window ratings excluded from Trending.
- [x] Untrusted-rating flood (spam-resistance by trust weighting).
- [x] Below-threshold (thinly-rated) book excluded from Favorites.
- [x] Genre with no trust signal → zero rows (not raw-filled).
- [x] Per-row + per-genre caps respected; only the top `SHELF_GENRE_COUNT` genres surface.
- [x] Trust seam throws / empty map / no observer → empty shelves, no crash, no 500.
- [x] Fatal mid-compute error → no partial cache write (atomic replace).
- [x] Unresolvable cached slug dropped on serve hydrate.
- [x] Serve makes no relay/trust call (serve-from-cache only).
- [x] Failed shelves fetch on the web → fallback render, no throw.
- [x] No raw GrapeRank number / tier / "trusted" badge on any shelf card or on the wire.

## Test infrastructure

- Test runner: Vitest across all packages.
  - `apps/shelves/test/*.test.ts` — node env (new package scaffolded with `package.json`,
    `tsconfig.json`, `vitest.config.ts` mirroring `apps/indexer`/`apps/promoter`). The worker
    compute reuses the API's shipped `FixtureTrustProvider` / `weightedRatings` via a relative
    import (no `@unbnd/trust` package exists yet; the worker composes over the API's trust seam).
  - `apps/api/test/...` — node env; the serve-route test uses express + supertest + `vi.fn` fakes.
  - `apps/web/test/home-trust-shelves.test.tsx` — happy-dom + Testing Library; stubs the api
    client via `vi.mock("../src/lib/api")` (spread `actual.api`, add `homepage.shelves`).
- No live relay / Neo4j / Postgres needed: all reads/writes are injected fakes. No
  `docker compose up` prerequisite for any of these tests.
- Fixtures: deterministic in-test event builders (`toBookRecordEvent` / `toBookRatingEvent` /
  `toBookTagEvent` / `toBookTagAssertionEvent` + a `FixtureTrustProvider` weight row keyed by the
  house observer hex). Injected `now = 1_750_000_000` pins the Trending window.

## How to run

```
pnpm --filter @unbnd/shelves test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
pnpm -r typecheck
```

## Verification

The new tests fail with the current code — for the right reasons (the worker, the cache
migration, the serve route, the `SHELF_*` config, and the `api.homepage.shelves` client do
not exist yet), NOT test bugs. Confirmed on 2026-06-02 at commit `700227d`.

### Red summary per package

`pnpm --filter @unbnd/shelves test` — 3 test files fail to load/run:
```
FAIL test/compute.test.ts — Failed to load url ../src/compute (Does the file exist?)
FAIL test/config.test.ts  — Failed to load url ../src/config (Does the file exist?)
FAIL test/architecture.test.ts > the worker source carries no Brainstorm/NIP-85 specifics
     ENOENT: no such file or directory, scandir 'apps/shelves/src'
Test Files  3 failed (3)
```

`pnpm --filter @unbnd/api test`:
```
FAIL test/routes/homepage-shelves.test.ts — Failed to load url ../../src/routes/homepage-shelves (Does the file exist?)
FAIL test/db/migrations-homepage-shelves.test.ts (5 tests | 5 failed)
     × appends a migration named 0005_homepage_shelves → expected undefined to be defined
     × is the next migration after 0004_reveals (ordered)
     × creates the homepage_shelves table idempotently (IF NOT EXISTS)
     × carries the cache columns: observer_hex, kind, position, book_slug, computed_at
     × enforces UNIQUE (observer_hex, kind, position)
Test Files  2 failed | 83 passed | 2 skipped (87)
      Tests  5 failed | 749 passed | 10 skipped (764)
```

`pnpm --filter @unbnd/web test`:
```
FAIL test/home-trust-shelves.test.tsx (8 tests | 5 failed)
     × renders Trending and Community Favorites when the cache has books
     × renders a genre shelf row from the cached genres
     × does not render a Trending shelf header when trending is empty
     × keeps the non-trust fallback even when trust shelves are populated
     × renders trust-shelf book cards with no GrapeRank number or tier string
Test Files  1 failed | 49 passed (50)
      Tests  5 failed | 285 passed (290)
```
(The 3 already-green web cases assert the always-present non-trust fallback + the
no-trust-shelves negative — they will stay green after implementation.)

### Typecheck result (PR-#74 rule — mock-shape-clean)

`pnpm -r typecheck` — `packages/schemas`, `packages/search`, `apps/seeder`,
`apps/indexer`, `apps/promoter` are **clean (Done)**. The only errors are
not-yet-built-module references (no mock-shape, no arity, no implicit-any noise):

```
apps/shelves  test/compute.test.ts(46,8): TS2307 Cannot find module '../src/compute'
apps/shelves  test/config.test.ts(6,31): TS2307 Cannot find module '../src/config'
apps/api      test/routes/homepage-shelves.test.ts(30,8): TS2307 Cannot find module '../../src/routes/homepage-shelves'
apps/web      test/home-trust-shelves.test.tsx(12,15): TS2305 Module '"../src/lib/api"' has no exported member 'HomepageShelves'
```

Every mock is typed against the real shapes (`PublicBook`, `TaxonomyElement`, `Config`,
`NostrFilter`, `SignedNostrEvent`, `FixtureTrustProvider`, `BookRecord`/`BookRating`). The
to-be-built worker types (`ShelfComputeDeps`, `ShelfCycleDeps`, `ShelfSet`, `ShelfRow`,
`ShelfGenre`), serve types (`HomepageShelvesDeps`, `CachedShelfSet`), and the web
`HomepageShelves` type are the only unresolved symbols — exactly the contract the
Implementer fills.

## Migrated tests

None. There was **no** pre-existing `Home.tsx` test, so the new
`apps/web/test/home-trust-shelves.test.tsx` is additive (not a migration). No existing
assertion was changed or weakened. The repo-wide ADR 0014 trust guard
(`apps/api/test/trust/architecture.test.ts`) is unchanged; it already scans `apps/` and now
also covers the new `apps/shelves` source once built (no edit needed).

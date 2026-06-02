# Test Plan: Story 35 — Homepage trust shelves

**Story:** `engineering-team/stories/done/35-homepage-trust-shelves.md`
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

None for the homepage/serve/worker surfaces. There was **no** pre-existing `Home.tsx` test, so
the new `apps/web/test/home-trust-shelves.test.tsx` is additive (not a migration). No existing
assertion was changed or weakened.

## Relocation to the `@unbnd/trust` package boundary (ADR 0036 Amendment 2026-06-02)

The amendment extracts the trust seam + the shared `weightedRatings`/`dedupeRatings` helpers into
a new `@unbnd/trust` workspace package, landed via a re-export shim. Per the amendment's test-ripple
list (A5), the **package-internal** tests are relocated to the new package boundary so the red set
drives the extraction. This is **pure relocation + import re-point — no assertion was changed or
weakened.**

**New package test scaffolding (test-only; the Implementer adds `packages/trust/src`):**
`packages/trust/{package.json,tsconfig.json,vitest.config.ts}` mirroring `packages/search` —
`@unbnd/trust` (private, `type:module`, `exports → ./src/index.ts`), deps `@unbnd/schemas`
(`workspace:*`) + `nostr-tools` + `ws`, devDeps `@types/ws`/`typescript`/`vitest`.

**Moved into `packages/trust/test/` (via `git mv`, history preserved), imports re-pointed to
`@unbnd/trust`:**

- `fixture.test.ts` (was `apps/api/test/trust/fixture.test.ts`) — `FixtureTrustProvider` /
  `resolveTrustProvider` / `FixtureSpec` seam tests; imports re-pointed `../../src/trust` →
  `@unbnd/trust`. The embedded `weightedRatings (ADR 0017)` divergence block was **split out** (below).
- `brainstorm.test.ts` (was `apps/api/test/trust/brainstorm.test.ts`) — `BrainstormProvider` adapter
  tests; import re-pointed `../../src/trust/brainstorm` → `@unbnd/trust`.
- `architecture.test.ts` (was `apps/api/test/trust/architecture.test.ts`) — the ADR 0014 repo-wide
  guard. Two surgical edits per A3: `REPO` recomputed for the new depth
  (`resolve(__dirname, "..", "..", "..")`) and the sole exception path
  `apps/api/src/trust/brainstorm.ts` → `packages/trust/src/brainstorm.ts`. It still scans
  `apps/` ∪ `packages/` repo-wide and forbids the Brainstorm/NIP-85 specifics + `brainstorm_login`
  everywhere except that one file. The guard's forbidden **pattern is unchanged**.
- `weighting.test.ts` (**new file** holding the split-out `weightedRatings` divergence test from the
  old `fixture.test.ts` block) — imports `weightedRatings` + `FixtureTrustProvider` + the `ParsedRating`
  type from `@unbnd/trust`. The raw arithmetic mean (formerly via `rawFromParsed`, which stays
  apps/api-only per A1) is computed inline so the same `(5+3+1)/3 = 3` raw value and the
  weighted-vs-raw **divergence assertion are preserved verbatim**. Every `weightedRatings` assertion
  (`average ≈ 4.5`, `trustedCount = 2`, divergence) is unchanged.

**Stays in apps/api (raw-summary / own-counts are apps/api-only per A1):**
`apps/api/test/ratings/summary.test.ts` (`summarizeRatings` raw-summary) and
`apps/api/test/ratings/own-counts.test.ts` (`countOwnRatings`) are **left in place, untouched** —
they were never `weightedRatings`/`dedupeRatings` tests. There is no standalone `dedupeRatings` test
to move; the only direct `weightedRatings`/`dedupeRatings`/`rawFromParsed` assertion lived in the
`fixture.test.ts` divergence block now split into `weighting.test.ts`.

**Cross-app import re-pointed (the gate-forbidden path):**
`apps/shelves/test/compute.test.ts` — `import { FixtureTrustProvider } from "../../api/src/trust"`
→ `@unbnd/trust`. This is the cross-app relative source import the gate forbids; it now points at
the shared package boundary (intended red until `packages/trust/src` exists).

**apps/api route/seam tests LEFT UNTOUCHED (shim-covered, A2/A5 — re-point is optional/cosmetic for
these under the shim, so they are left to minimize churn):** every apps/api test importing
`FixtureTrustProvider`/`BrainstormProvider`/`TrustProvider`/`FixtureSpec` via `../../src/trust` or the
deep `../../src/trust/fixture` path — `routes/{search,tags-weighted,tags-accusatory-gate,
submissions-signals,submissions-promote,submissions-list-enriched,author-verified,author-edits,
books-verified-merge,trust,trust-custodial}.test.ts`, `search/rerank.test.ts`,
`tags/aggregate-weighted.test.ts`, `author-verified/verify.test.ts`. Verified these still resolve:
`apps/api/src/trust/{index,fixture,types,brainstorm}.ts` is **physically untouched** by this
relocation (only tests moved), so both the shimmed `../../src/trust` and the deep `../../src/trust/fixture`
imports resolve against the still-present source. Confirmed live: `routes/trust.test.ts` (8 tests) and
`routes/trust-custodial.test.ts` (14 tests) **pass**, and the whole apps/api suite typechecks with the
only error being the not-yet-built `homepage-shelves` route — no trust-import error anywhere. Once the
Implementer lands the shim (apps/api re-exports `@unbnd/trust`), these keep working unchanged. The
worker-scoped guard `apps/shelves/test/architecture.test.ts` stays (subsumed by, not replaced by, the
relocated repo-wide guard, per A3).

### Red summary after the relocation (intentionally red — drives the extraction)

`pnpm --filter @unbnd/trust test`:
```
FAIL test/fixture.test.ts     — Failed to resolve entry for package "@unbnd/trust" (no ./src yet)
FAIL test/brainstorm.test.ts  — Failed to resolve entry for package "@unbnd/trust" (no ./src yet)
FAIL test/weighting.test.ts   — Failed to resolve entry for package "@unbnd/trust" (no ./src yet)
FAIL test/architecture.test.ts > Brainstorm API specifics live only in the adapter
     → leaked outside the adapter: apps/api/src/trust/brainstorm.ts (the source has NOT
       moved into packages/trust/src/brainstorm.ts yet — the Implementer's move turns this green)
Test Files  4 failed (4)
```

`pnpm --filter @unbnd/shelves test`:
```
FAIL test/compute.test.ts       — Failed to load url @unbnd/trust (re-pointed cross-app import; no ./src yet)
FAIL test/config.test.ts        — Failed to load url ../src/config (not-yet-built worker config)
FAIL test/architecture.test.ts  — ENOENT scandir apps/shelves/src (worker src not built)
Test Files  3 failed (3)
```

`pnpm --filter @unbnd/api test` — the prior Story-35 red is unchanged; **no new failure from the
relocation** (the trust route/seam tests still RUN):
```
✓ test/routes/trust.test.ts (8 tests)            ← shim-path trust import resolves
✓ test/routes/trust-custodial.test.ts (14 tests) ← shim-path trust import resolves
FAIL test/routes/homepage-shelves.test.ts        — not-yet-built ../../src/routes/homepage-shelves
FAIL test/db/migrations-homepage-shelves.test.ts (5 failed)  — not-yet-built 0005 migration
Test Files  2 failed | 80 passed | 2 skipped (84)
      Tests  5 failed | 728 passed | 10 skipped (743)
```

`pnpm --filter @unbnd/web test` — unchanged by the relocation (5 prior Story-35 component reds):
```
FAIL test/home-trust-shelves.test.tsx (5 failed)  — not-yet-built api.homepage.shelves / HomepageShelves
Test Files  1 failed | 49 passed (50)
      Tests  5 failed | 285 passed (290)
```

### Typecheck after relocation (mock-shape-clean — PR-#74 rule)

`pnpm -r typecheck` — `packages/schemas`, `packages/search`, `apps/seeder`, `apps/indexer`,
`apps/promoter` are **clean**. Every remaining error is a not-yet-built-module reference — NO
mock-shape, NO arity, NO implicit-any:
```
packages/trust  test/{brainstorm,fixture,weighting}.test.ts  TS2307 Cannot find module '@unbnd/trust'
apps/shelves    test/compute.test.ts  TS2307 Cannot find module '@unbnd/trust' / '../src/compute'
apps/shelves    test/config.test.ts   TS2307 Cannot find module '../src/config'
apps/api        test/routes/homepage-shelves.test.ts  TS2307 Cannot find module '../../src/routes/homepage-shelves'
apps/web        test/home-trust-shelves.test.tsx       TS2305 '../src/lib/api' has no exported member 'HomepageShelves'
```
The relocated `packages/trust/test/*` and the re-pointed `apps/shelves/test/compute.test.ts` fail
ONLY on the missing `@unbnd/trust` module — the intended red. apps/api's trust route/seam tests
typecheck with no trust-import error (the source is still present), confirming the shim path resolves.

The repo-wide ADR 0014 trust guard now lives at `packages/trust/test/architecture.test.ts` (moved with
the code); it still scans `apps/` ∪ `packages/` and turns green once the Implementer moves
`brainstorm.ts` into `packages/trust/src/`.

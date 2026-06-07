# Test Plan: Story 71 — Hidden Gems homepage shelf

**Story:** `engineering-team/stories/71-hidden-gems-shelf.md`
**ADR:** `engineering-team/decisions/0069-hidden-gems-shelf.md`
**Date:** 2026-06-07

## Coverage map
Map each acceptance criterion to a test. Hidden Gems threads the existing
three-layer shelf machinery (Story 35 / ADR 0036): the off-path `apps/shelves`
worker computes + caches ordered slugs; the serve route hydrates them; the web
Home renders them. Each layer gets its own red test.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (highest positive hype-gap from house viewpoint, gated + ranked) | `it("ranks by gap (trusted above crowd) desc; excludes consensus and overhyped")` | `apps/shelves/test/compute.test.ts` | unit |
| AC-1 (gate: enough trusted raters) | `it("excludes a book below the trusted-rater minimum even with a large gap")` | `apps/shelves/test/compute.test.ts` | unit |
| AC-1 (honest empty when nothing qualifies) | `it("returns an empty hiddenGems shelf when no book clears the margin + minimum")` | `apps/shelves/test/compute.test.ts` | unit |
| AC-1 (serve hydrates the cached gems in order) | `it("hydrates the cached Hidden Gems slugs in order")` | `apps/api/test/routes/homepage-shelves.test.ts` | integration |
| AC-2 (serve honest-empty shelf) | `it("returns an empty Hidden Gems shelf when the cache has none")` | `apps/api/test/routes/homepage-shelves.test.ts` | integration |
| AC-1 (web renders the shelf) | `it("renders a Hidden Gems shelf with its books when the cache has gems")` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-2 (web on-ramp empty state) | `it("shows the on-ramp empty state when Hidden Gems is empty (cold-start)")` | `apps/web/test/home-trust-shelves.test.tsx` | component |
| AC-3 (scheduled, never per request) | covered by reuse: the shelf is produced by `computeShelves` in the off-path worker and the serve route reads cache only — guarded by the existing `NEVER computes on the request path` suite (no new trust/rating read introduced) | `apps/api/test/routes/homepage-shelves.test.ts` | integration |

## Edge cases
Things not in the acceptance criteria but still worth covering.

- [x] Consensus book (trusted ≈ raw, no gap) — excluded by the ranking test.
- [x] Overhyped book (crowd above trusted, negative gap) — excluded by the ranking test.
- [x] A real gap but too few trusted raters — excluded by the min-raters test.
- [x] Nothing qualifies — honest empty array, never filler (cold-start on-ramp).
- [x] A cached gem slug that no longer resolves to a catalog book — covered by the existing serve "drops a cached slug" hydrate behavior (the `hydrate` helper is shared).
- [x] Old pre-#71 cache rows lacking `hiddenGems` — `CachedShelfSet.hiddenGems?` is optional and read as `[]` (back-compat); the serve "empty when cache has none" test exercises the default-makeApp cache that omits it.
- [x] No trust score / tier / "gap number" crosses the wire — covered by the existing `no trust score/tier on the wire` suite (Hidden Gems reuses the same `{ books }` shape, no new fields).

## Test infrastructure
- Test runner: Vitest (`apps/shelves/test/...`, `apps/api/test/...`, `apps/web/test/...`).
- Worker unit: pure `computeShelves` against in-memory rating/weight fixtures — no relay. New helpers `gemBook(slug, trustedScore, untrustedScore)` (3 trusted weighted + 3 untrusted zero-weight raters) and `gemDeps()` build a deterministic gap.
- Serve integration: express + supertest + `vi.fn` DI fakes (`makeQuery`, `makeReadShelfCache`) — no intra-module `vi.mock`.
- Web component: the api CLIENT is stubbed (`homepageShelvesMock`), never the network (CLAUDE.md house rule).
- No new env beyond `HIDDEN_GEMS_MARGIN` (default `0.5`), parsed by `positiveFloat()` in `apps/shelves/src/config.ts`; the trusted-rater minimum reuses `favoritesMinRatings` (ADR 0069 — no new knob set).

## How to run

```
pnpm --filter @unbnd/shelves test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Verification
The new tests fail with the current (stub) code. Confirmed 2026-06-07 at commit `93be160`:

```
# apps/shelves
 ❯ test/compute.test.ts (18 tests | 1 failed)
   × computeShelves — Hidden Gems: positive hype-gap, gated + ranked
       > ranks by gap (trusted above crowd) desc; excludes consensus and overhyped
   (the two gate/empty cases pass against the [] stub; the ranking case is the red driver)

# apps/api
 ❯ test/routes/homepage-shelves.test.ts (8 tests | 2 failed)
   × GET /api/homepage/shelves — Hidden Gems > hydrates the cached Hidden Gems slugs in order
   × GET /api/homepage/shelves — Hidden Gems > returns an empty Hidden Gems shelf when the cache has none

# apps/web
 ❯ test/home-trust-shelves.test.tsx (10 tests | 2 failed)
   × Home — Hidden Gems shelf > renders a Hidden Gems shelf with its books when the cache has gems
   × Home — Hidden Gems shelf > shows the on-ramp empty state when Hidden Gems is empty (cold-start)
```

`pnpm -r typecheck` is clean. No regressions: the only failing files are the three above (a transient `submissions-list-enriched` timeout passes 14/14 in isolation).

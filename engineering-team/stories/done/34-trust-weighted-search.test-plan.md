# Test Plan: Story 34 — Trust-weighted search re-ranking

**Story:** `engineering-team/stories/done/34-trust-weighted-search.md`
**ADR:** `engineering-team/decisions/0035-trust-weighted-search.md`
**Date:** 2026-06-02
**Branch:** `feat/search-rerank`

## Summary

ADR 0035 specifies a pure, page-bounded re-rank step in `apps/api`:

```
normText(hit)   = clamp01(hit.score ?? 0)
normTrust(book) = avg == null ? 0.5 (NEUTRAL) : (avg − 1) / 4     // weightedRatings.average ∈ [1,5]
final(hit)      = (1 − w) · normText + w · normTrust              // w = config.searchTrustBlend, env SEARCH_TRUST_BLEND, default 0.25
```

Hits are stable-sorted by `final` descending (equal finals keep incoming text order). The page's
books' rating events are read per-book via `query({ kinds:[39999], "#a":[addr] })` (≤ `limit`), the
union of raters is resolved in **one** `trust.weights(observerHex, raters)` call, and any trust
failure (`!trust`, no observer, empty map, a throw) degrades silently to the adapter's pure
text-relevance order — never a 500. The existing route contract is preserved: `q` < 2 → empty 200;
a **search provider** error → 503 `search_unavailable` (only the *trust* layer degrades). House-only
vantage for v1; the module signature takes an `observerHex` so `?observer=` is a thin later add.

Tests are fixture-driven and deterministic: a real `FixtureTrustProvider` (known observer → known
weights), a fake `query` keyed by each book's `#a` address, real `signedRating` kind-39999 fixtures,
and a minimal `Config`. **No live relay/Meili, no intra-module `vi.mock`** — dependency injection
only, matching the ratings/search route test style.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 | `lifts the higher-trusted book above a slightly-better text match` + `under text relevance ALONE (no blend) the better text match stays on top` | `apps/api/test/search/rerank.test.ts` | unit |
| AC-1 (e2e) | `reorders hits by the blend from the house vantage` | `apps/api/test/routes/search.test.ts` | integration |
| AC-2 | `computes the trust signal from the supplied observer hex (house default)` + `is parametric: a different observer … yields a different order` | `apps/api/test/search/rerank.test.ts` | unit |
| AC-3 | `w=0 → order is EXACTLY the incoming text order` + `high w → the trust-weighted average drives order among comparable-text hits` | `apps/api/test/search/rerank.test.ts` | unit |
| AC-3 (config) | `SEARCH_TRUST_BLEND` default 0.25 / override / boundaries / reject <0,>1,non-numeric (6 tests) | `apps/api/test/config.test.ts` | unit |
| AC-4 | `keeps an unrated-but-relevant book above a trusted-but-mediocre one` + `does NOT inflate a no-signal book above a genuinely high-trusted one` | `apps/api/test/search/rerank.test.ts` | unit |
| AC-5 | `a throwing trust.weights degrades to the adapter's text order (never throws)` (unit) + route: `falls back to pure text order when the trust provider throws (200, not 500)`, `… no observer …`, `… empty map …`, `a SEARCH provider error still 503s`, `short query (<2 chars) still returns an empty 200` | `rerank.test.ts` + `search.test.ts` | unit + integration |
| AC-6 | `calls trust.weights EXACTLY ONCE over the union of the page's raters` + `reads ratings for ONLY the books on the page (≤ page size)` + `leaves the page contract (total/offset/limit) untouched` | `apps/api/test/search/rerank.test.ts` | unit |
| AC-7 | `backend API specifics live only in the matching adapter` (existing guard, must stay green) | `apps/api/test/search/architecture.test.ts` | unit |
| AC-8 | All of the above run under the fixture provider (`FixtureTrustProvider`), no Brainstorm/relay/human; ADR 0014 + ADR 0013 guards stay green | all files above | — |
| normalization | `maps trusted average 5→1.0, 3→0.5, 1→0.0 via (avg−1)/4` + `clamps an out-of-range text score into [0,1]` + `a stable sort keeps input order for hits with equal final scores` | `apps/api/test/search/rerank.test.ts` | unit |

### How each load-bearing behavior is asserted

- **Reorder (AC-1).** Two hits where text order is `b-book`(0.82) > `a-book`(0.80) but `a-book` is
  trusted-rated 5 and `b-book` trusted-rated 1; at the default blend 0.25 the output order is
  `[a-book, b-book]`. The companion `blend:0` test on the SAME data yields `[b-book, a-book]`,
  proving the flip is the trust signal, not a fixture artifact. The route-level test drives the
  same flip end to end through `GET /api/search`.
- **Both blend extremes (AC-3).** `w=0`: a strong trust signal on the text-weakest book leaves the
  output EXACTLY equal to the incoming text order `[c,b,a]`. High `w` (`blend:1`): three near-equal
  text scores in REVERSE trust order produce trust order `[a(5), b(3), c(1)]` — only trust can
  yield that.
- **Neutral 0.5 (AC-4).** A `unrated` book (no rating events → `weightedRatings` null → NEUTRAL 0.5)
  with text 0.80 stays above a `mediocre` trusted-rated-2 book (normTrust 0.25) at `w=0.5`
  (0.65 vs 0.515) — NOT sunk. The inverse test confirms it is NOT inflated above a trusted-rated-5
  book (`excellent` stays on top at equal text). The normalization test pins that a trusted avg of
  3.0 lands at the same 0.5 as NEUTRAL (equal text → stable order preserved).
- **Single batched weights call (AC-6).** `vi.spyOn(trust, "weights")` asserts `toHaveBeenCalledTimes(1)`
  for a 3-book page, and that the single call's target array equals the UNION of the three raters
  (sorted compare). Separate tests assert per-book reads are ≤ page size and each targets exactly one
  `#a`, and that `total`/`offset`/`limit` are untouched (137/40/20 round-trips unchanged).
- **Degrade never-500 (AC-5).** Unit: a `mockRejectedValue` on `weights` returns the untouched text
  order with no throw. Route: the same throw returns HTTP 200 in text order; `houseObserverPubkey:
  undefined` and an empty weight map likewise return text order 200.
- **Preserved 503 + short-query (AC-5).** A throwing `searchProvider.search` still returns 503
  `search_unavailable` even with trust wired (the trust catch must NOT swallow it). `q="a"` returns
  the empty 200 body and the trust `query` is asserted NEVER called (blend never reached).

## Edge cases covered

- [x] No-signal book (no rating events) → NEUTRAL 0.5, not sunk, not inflated.
- [x] Empty trust weight map → all-NEUTRAL → text order preserved (effective no-op).
- [x] Trust provider throws → silent degrade to text order, no 500.
- [x] No observer hex (`null`) / `houseObserverPubkey` unset → no-op text order.
- [x] `blend ≤ 0` short-circuit → result unchanged, `weights` NOT called.
- [x] Out-of-range text score (>1) → `clamp01` before blend.
- [x] Equal final scores → stable sort keeps input order.
- [x] Pagination preserved (`total`/`offset`/`limit` untouched; rerank confined to the page).
- [x] Short query (<2) still empty 200; trust read never reached.
- [x] Search provider 503 preserved when trust is wired.
- [x] Observer-parametric (House vs a different observer → two different orders).

## Test infrastructure

- Test runner: Vitest (workspace default). New/edited tests live under `apps/api/test/`.
- **No live services required.** All trust + ratings + search inputs are injected:
  - `FixtureTrustProvider` (`apps/api/src/trust/fixture.ts`, ADR 0017) — the real class, constructed
    with a deterministic `{ weights: { [observerHex]: { [raterHex]: w } } }` spec.
  - `signedRating` / `LIBRARIAN` (`apps/api/test/ratings/_fixtures.ts`) — real signed kind-39999
    rating events keyed to the `LIBRARIAN` book address; `score` and rater identity controllable.
  - A fake `query` that returns the events registered for each `#a` address.
  - A fake `searchProvider.search` returning hits with known `score`s.
- This is the `TRUST_PROVIDER=fixture` path (AC-8): no Brainstorm, no relay, no human.
- ADR 0013 architecture guard (`apps/api/test/search/architecture.test.ts`) and ADR 0014 trust guard
  must stay green: the new code lives in `apps/api/src/search/` + the route + config, reads only
  `SearchHit.score`, and carries no Meili token. Confirmed green at Test Design time (no new code
  yet, and the test code itself carries no forbidden token).

## How to run

```
pnpm --filter @unbnd/api test
pnpm -r test
pnpm -r typecheck
```

## Verification

The new tests fail with the current code, for the right reason — the production module/contract
does not exist yet, NOT a test bug. Confirmed on 2026-06-02 on `feat/search-rerank`.

### `pnpm --filter @unbnd/api test` (red summary)

```
 ❯ test/search/rerank.test.ts (0 test)
 FAIL  test/search/rerank.test.ts [ test/search/rerank.test.ts ]
 Error: Failed to load url ../../src/search/rerank (resolved id: ../../src/search/rerank)
   in apps/api/test/search/rerank.test.ts. Does the file exist?   ← module not built yet (24 it() blocks gated)

⎯⎯⎯ Failed Tests 7 ⎯⎯⎯
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > defaults to 0.25 …
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > respects an explicit numeric override
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > accepts the boundary values 0 and 1
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > throws when the value is below 0
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > throws when the value is above 1
 FAIL  test/config.test.ts > loadConfig — SEARCH_TRUST_BLEND (ADR 0035) > throws on a non-numeric value
 FAIL  test/routes/search.test.ts > GET /api/search — trust-weighted re-ranking (AC-1, AC-8)
        > reorders hits by the blend from the house vantage
        AssertionError: expected [ 'b-book', 'a-book' ] to deeply equal [ 'a-book', 'b-book' ]
        (route does not call the re-rank yet → pure text order)

 Test Files  3 failed | 80 passed | 2 skipped (85)
      Tests  7 failed | 724 passed | 10 skipped (741)
```

Failure reasons (all correct):
- `rerank.test.ts` — the whole file fails to import because `apps/api/src/search/rerank.ts` does not
  exist yet (not-yet-built module). Its 24 `it()` blocks will run once the module ships.
- `config.test.ts` (6) — `searchTrustBlend` is not parsed yet (`config.searchTrustBlend` is
  `undefined`, and no validation throw on out-of-range / non-numeric).
- `search.test.ts` (1) — the route returns the adapter's pure text order because it does not yet
  resolve the house observer and call `rerankByTrust`. (The 5 AC-5 degrade tests in this file PASS
  today because pure-text == the degrade order; they pin the preserved contract and will stay green.)

### `pnpm -r typecheck` (mock-shape clean)

Every other package types clean (`packages/search`, `packages/schemas`, `apps/web`, `apps/indexer`,
`apps/seeder`, `apps/promoter` all Done). Only `apps/api` fails, and **every** failing line is a
not-yet-built-module / not-yet-extended-contract error that resolves at implementation — **no
mock-shape, no implicit-any, no wrong-arity errors** (PR-#74 rule satisfied):

```
test/config.test.ts(233,14): error TS2339: Property 'searchTrustBlend' does not exist on type 'Config'.   (×5)
test/routes/search.test.ts(53,5): error TS2353: 'config' does not exist in type 'SearchDeps'.
test/routes/search.test.ts(127,5): error TS2353: 'query' does not exist in type 'Partial<SearchDeps>'.
test/routes/search.test.ts(161,19): error TS2339: Property 'trust' does not exist on type 'SearchDeps'.
test/routes/search.test.ts(200,9): error TS2353: 'trust' does not exist in type 'Partial<SearchDeps>'.
test/routes/search.test.ts(210,7): error TS2353: 'query' does not exist in type 'Partial<SearchDeps>'.
test/search/rerank.test.ts(22,31): error TS2307: Cannot find module '../../src/search/rerank' …
```

These all clear when the Implementer (a) adds `searchTrustBlend: number` to `Config`, (b) extends
`SearchDeps` to `{ searchProvider; config; query; trust? }`, and (c) creates
`apps/api/src/search/rerank.ts` exporting `rerankByTrust`.

## Migrated tests (faithful)

- **`apps/api/test/routes/search.test.ts`** — the original `makeApp(search)` built the router with
  only `{ searchProvider }`. `SearchDeps` becomes additive (`{ searchProvider; config; query; trust? }`),
  so `makeApp` now also injects `config` (with `searchTrustBlend`, `librarianPubkey`,
  `houseObserverPubkey`) and a fake `query`, and accepts an `extra` deps override. The **four
  pre-Story-34 contract tests are unchanged in intent** and still assert the same things (provider
  results, short-query empty 200, genre filter + limit clamp, provider-throw 503); they run with
  trust OFF (no `trust` dep) so re-ranking is a no-op and pure text order is preserved — faithful to
  the prior behavior. New `describe` blocks add the AC-1 reorder and the AC-5 degrade/contract cases.

No web tests were migrated: house-only v1 with thin fixture data leaves the `/search` page result
order unchanged (the web page passes no observer and the live graph yields no trusted signal), so no
web result-order assertions change.

## Linked artifacts

Test files written/edited this phase:
- `apps/api/test/search/rerank.test.ts` — NEW (24 unit tests; the core blend/normalize/neutral/batched/degrade).
- `apps/api/test/routes/search.test.ts` — MIGRATED + EXTENDED (4 faithful contract tests migrated to
  the additive `SearchDeps`; 6 new route-level reorder + degrade tests).
- `apps/api/test/config.test.ts` — EXTENDED (6 new `SEARCH_TRUST_BLEND` tests).
- `apps/api/test/search/architecture.test.ts` — UNCHANGED (ADR 0013 guard; confirmed green).

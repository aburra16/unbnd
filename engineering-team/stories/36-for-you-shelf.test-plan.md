# Test Plan: Story 36 — For-You personalized shelf

**Story:** `engineering-team/stories/36-for-you-shelf.md`
**ADR:** `engineering-team/decisions/0037-for-you-shelf.md` (Accepted)
**Date:** 2026-06-02
**Branch:** `feat/for-you-shelf`

The whole red set runs against the **fixture `TrustProvider`** (`FixtureTrustProvider`
from `@unbnd/trust`, the `TRUST_PROVIDER=fixture` path) with deterministic weights,
the signed kind-39999 fixtures from `apps/api/test/ratings/_fixtures.ts`, and DI seams
(`sessionUser` / `query` / `queryPaged` / `trust`). No Brainstorm, no relay, no human,
no `Date.now()` in asserted output, no intra-module `vi.mock`. Every test asserts the
**real** response body (`{ state, books }`) / the real `ForYou` api contract — no
fabricated mock divorced from the route's return type.

## Test files

| File | Level | What it pins |
|---|---|---|
| `apps/api/test/routes/foryou.test.ts` | route (express+supertest) | the `GET /api/foryou` contract end-to-end (AC-1,2,3,4,5,6,7 + wire hygiene) |
| `apps/api/test/ratings/own-rated-slugs.test.ts` | unit | the new `ownRatedSlugs(events): Set<string>` helper (AC-3) |
| `apps/api/test/config-foryou.test.ts` | unit | the 4 new env knobs default + range-reject (AC-2/4/6 config) |
| `packages/trust/test/architecture-foryou.test.ts` | guard | `foryou.ts` falls under the ADR-0014 repo-wide guard (AC-8) |
| `apps/web/test/foryou-api.test.ts` | unit | `api.foryou()` + `ForYou` type, typed to the real contract |
| `apps/web/test/home-foryou.test.tsx` | component (Testing Library) | `Home.tsx` renders shelf / invitation / nothing per `state` (AC-1/5/7) |

## Coverage map (case count per AC)

| Criterion | Cases | Test names (abbrev) | File |
|---|---|---|---|
| **AC-1** own-vantage ranking; two graphs → two shelves | **5** | ranks by user's-vantage weighted avg desc · drops books the user's curators don't trust · two users/different graphs → different shelves · observer == session user hex · slug tie-break | `routes/foryou.test.ts` |
| **AC-2** bar ≥ 4.0 AND trustedCount ≥ 2 | **5** | include avg 4.0 / count 2 (both boundaries) · exclude avg < 4.0 · exclude lone trusted 5-star (count 1) · configurable higher bar excludes 4.0 · configurable min-count 3 excludes count-2 | `routes/foryou.test.ts` |
| **AC-3** exclude already-rated | **2** (route) + **5** (helper) | route: a qualifying book the user rated is absent, an unrated one stays · own-ratings read is author-scoped to the session hex // helper: returns the slug set, latest-wins per book, empty set, ignores malformed, consistent with `countOwnRatings` | `routes/foryou.test.ts`, `ratings/own-rated-slugs.test.ts` |
| **AC-4** read-time, not cached | **2** | computes per request (weights + reads exercised on the request path) · no `readShelfCache` dep in `ForYouDeps` (type/wiring-level no-cache pin) | `routes/foryou.test.ts` |
| **AC-5** not_personalized / anonymous (no fabrication) | **4** (route) + **2** (web) | route: signed-in-not-personalized → `not_personalized`, **no `weights` compute** · signed-out → `anonymous`, 200 not 401 · no trust dep → `not_personalized` · no librarian → `not_personalized` // web: invitation copy + "Personalize your view" link for `not_personalized`; nothing for `anonymous` | `routes/foryou.test.ts`, `home-foryou.test.tsx` |
| **AC-6** bounded + ONE batched `weights` | **2** | exactly **one** `weights(userHex, raterUnion)` call (`toHaveBeenCalledTimes(1)`) over the union · rater union capped at `FORYOU_CANDIDATE_RATERS` | `routes/foryou.test.ts` |
| **AC-7** honest empty / honest degrade (never 500) | **3** (route) + **2** (web) | thin graph (no qualifier) → `personalized` + `[]` · `weights` rejects → `personalized` + `[]`, **200 never 500** · empty weight map → `personalized` + `[]` // web: nothing for `personalized` + empty; degrade-to-nothing when the fetch fails | `routes/foryou.test.ts`, `home-foryou.test.tsx` |
| **AC-8** fixture-CI + guards green | **2** (guard) + (whole suite) | `foryou.ts` lives under the guard scan root (apps ∪ packages) · carries no Brainstorm/NIP-85 specifics once written · the existing `architecture.test.ts` stays green | `architecture-foryou.test.ts` |
| **config** (4 envs) | **18** | `FORYOU_MIN_AVG` (default 4.0, override, [1,5] boundaries, <1 / >5 / non-numeric reject) · `FORYOU_MIN_RATINGS` (default 2, override, zero/neg/non-int reject) · `FORYOU_BOOKS` (default 12, override, reject) · `FORYOU_CANDIDATE_RATERS` (default 2000, override, reject) | `config-foryou.test.ts` |
| **wire hygiene** (CLAUDE.md) | **1** | no `graperank` / `trusted` / `tier` / `weight` / `average` / `trustedCount` on the wire; cards are display fields only | `routes/foryou.test.ts` |
| **web api contract** | **3** | `api.foryou()` exists + returns `{ state, books }` · credentialed fetch (cookie → vantage) · the three states assignable | `foryou-api.test.ts` |
| **web no-trust-on-card** | **1** | For-You cards carry no GrapeRank number / tier / "trusted" | `home-foryou.test.tsx` |
| **doc guard** | **1** | the ratings/books header addresses resolve to the librarian (read-shape doc) | `routes/foryou.test.ts` |

Route test file total: **24** cases. Helper: **5**. Config: **18**. Guard: **2**. Web api: **3**. Web Home: **6**. **Grand total: 58 new cases.**

## Locked design facts asserted (ADR 0037)

- Endpoint `GET /api/foryou` (`buildForYouRouter(deps)`), **always 200**, never 401/500;
  `state` ∈ `personalized | not_personalized | anonymous`; personalized-but-empty is
  `personalized` + `[]`.
- Vantage = **session `user.pubkeyHex`** (asserted: `weights` called with `USER_HEX`).
  Gate = `trust.hasScores(userHex)` (asserted via the fixture `scoredObservers`).
- **ONE** batched `weights(userHex, raterUnion)` call (`toHaveBeenCalledTimes(1)`); union
  capped at `FORYOU_CANDIDATE_RATERS`; no per-book per-rater fan-out.
- Qualify: `average ≥ FORYOU_MIN_AVG` (4.0) AND `trustedCount ≥ FORYOU_MIN_RATINGS` (2);
  exclude `ownRatedSlugs`; rank avg desc, slug tie-break; cap `FORYOU_BOOKS` (12).
- Two personalized users with different weight maps → different shelves for one catalog.
- Honest degrade: `weights` rejects → caught → empty map → all `weightedRatings` null →
  `personalized` + `[]`, 200.
- Web: `Home.tsx` renders For-You **above** the house shelves; invitation for
  `not_personalized`; nothing for `anonymous` / `personalized`-empty; `api.foryou()`
  typed to the real `ForYou` contract.

## Edge cases covered (beyond the bare ACs)

- [x] Personalized-but-empty (thin graph) vs non-personalized vs signed-out — three
      distinct honest states, not one.
- [x] Boundary at the bar (avg exactly 4.0) and at the count (exactly 2).
- [x] Configurable bar / min-count actually move the cut (raise → exclude).
- [x] Trust provider **throws** vs resolves an **empty map** — both degrade to honest empty.
- [x] Rater-union cap respected even when the catalog has more raters than the cap.
- [x] Deterministic slug tie-break for equal averages.
- [x] `ownRatedSlugs` ignores malformed events and collapses re-ratings (latest-wins).
- [x] No trust score / tier / count crosses the wire (API and web card).

## Known red-set property (web negative states)

Three `home-foryou.test.tsx` cases assert **absence** (anonymous / personalized-empty /
fetch-failure → no For-You surface). With no For-You code in `Home.tsx` yet, "nothing
renders" is already true, so these **pass vacuously today** rather than failing red. They
are kept as regression guards (they will hold the silence-when-absent contract once the
feature lands). The hard red signal for AC-5/AC-7 is carried by the **API route tests**
(`not_personalized` with no compute, `anonymous`, thin-graph empty, `weights`-throws → 200)
and the **AC-5 web invitation** case (which fails red today). This is the standard,
accepted limitation of asserting negative UI states before the surface exists; no fabricated
positive was substituted to force a red.

## ADR-0014 trust-guard coverage of `foryou.ts` (AC-8)

The repo-wide guard `packages/trust/test/architecture.test.ts` walks `apps` ∪ `packages`
recursively (skipping `node_modules`/`dist`/`.git`/`engineering-team`), so
`apps/api/src/routes/foryou.ts` is **already in scope** once written — the guard scan root
does **not** exclude `apps/api/src/routes`. The new `architecture-foryou.test.ts` pins this
explicitly (a scan-root coverage assertion that is meaningful now, plus a content assertion
deferred until the file exists) **without weakening the guard**. No open question here.

## Test infrastructure
- Runner: Vitest (workspace default). API route tests: express + supertest + `vi.fn`
  fakes + the real `FixtureTrustProvider`. Web: Testing Library, the api **client** stubbed
  (never the component under test, never the network), fixtures typed to the real `ForYou`.
- No Docker / relay / Brainstorm dependency — the fixture provider is deterministic
  (§2.0 / ADR 0017). No new framework, no Playwright.

## How to run

```
pnpm --filter @unbnd/api  test -- --run routes/foryou own-rated-slugs config-foryou
pnpm --filter @unbnd/trust test -- --run architecture
pnpm --filter @unbnd/web  test -- --run foryou-api home-foryou
pnpm -r typecheck
pnpm -r test
```

## Verification (red, for the right reason)

Confirmed on 2026-06-02 on `feat/for-you-shelf`:

- **`pnpm -r typecheck`** — mock-shape-clean. The ONLY type errors are the not-yet-existing
  targets: `Cannot find module '../../src/routes/foryou'`; `summary` has no `ownRatedSlugs`;
  `Config` has no `foryou*` fields; api `ForYou` / `api.foryou` not exported yet. No
  mock-shape errors (wrong arity, too-narrow tables, missing params).
- **API** — `routes/foryou.test.ts` red: `Failed to load url ../../src/routes/foryou (Does
  the file exist?)`. `own-rated-slugs.test.ts` red: `ownRatedSlugs is not a function`.
  `config-foryou.test.ts` red: `expected undefined to be 4` / `expected [Function] to throw`.
- **trust guard** — `architecture-foryou.test.ts` + `architecture.test.ts`: **3 passed**
  (the For-You route falls under the guard; the existing guard stays green).
- **web** — `foryou-api.test.ts` red: `api.foryou is not a function`. `home-foryou.test.tsx`
  red on the positive cases: `Unable to find an element with the text: /for you/i` and the
  invitation copy. (3 negative-state cases pass vacuously, per the note above.)
- **No regressions** — the neighboring api suites (`config`, `ratings`, `homepage-shelves`,
  `search`, `own-counts`) and the existing trust guard remain green (85 + 3 passing).
```
apps/api  test/routes/foryou.test.ts        → Failed to load url ../../src/routes/foryou
apps/api  test/ratings/own-rated-slugs.test → TypeError: ownRatedSlugs is not a function
apps/api  test/config-foryou.test.ts        → expected undefined to be 4 / expected [Function] to throw
packages/trust architecture(-foryou).test   → 3 passed
apps/web  test/foryou-api.test.ts           → TypeError: api.foryou is not a function
apps/web  test/home-foryou.test.tsx         → Unable to find text /for you/i (+ invitation copy)
```

## Contract ambiguities flagged to the Implementer / Architect

1. **Own-ratings read filter — `#z` scoping.** ADR §3 shows the own-ratings read as
   `queryPaged({ kinds:[39999], authors:[user.pubkeyHex], "#z":[ratingsHeaderAddress] })`,
   while the profile-stats path (`countOwnRatings`) reads author-scoped **without** a `#z`.
   The red set asserts only that the own-ratings read is **author-scoped to the session hex
   on kind 39999** (the load-bearing fact for AC-3) and does NOT pin the `#z` tag, leaving
   the Implementer free to follow the ADR's `#z` scoping or the profile-stats shape. Confirm
   which is intended; the test will not block either.
2. **Candidate ratings read: `query` vs `queryPaged`.** ADR §2 says "`query(...)` or
   `queryPaged` past the 500 cap." The fakes serve both, and the tests don't pin which the
   route uses for the candidate read. Implementer's call (cap-safety suggests `queryPaged`).
3. **Web personalize affordance target.** ADR §5 gives the link label "Personalize your
   view" but the shipped personalize trigger is a button in `PoVBar` / `RatingsPanel`
   (`useTrustView().personalize`), not a route. The web test asserts the **label text** is
   present, not a specific `href`, so the Implementer can wire it to the existing trigger or
   a route without the test over-constraining. Confirm the intended affordance.
4. **Web vacuous negatives** (see "Known red-set property") — not an ambiguity, but flagged
   so the Reviewer knows the AC-5/AC-7 negative-UI cases lean on the API tests for their red
   signal.
```
```

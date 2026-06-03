# Review: Story 36 — For-You personalized shelf

**Reviewer:** Claude (acting as Reviewer — independent; did not write the code or tests)
**Date:** 2026-06-02
**Diff:** `git diff main...feat/for-you-shelf` (Implementer commit `b3fdbe1`, Tester commit `284bcbd`)
**Story:** `engineering-team/stories/36-for-you-shelf.md`
**ADR:** `engineering-team/decisions/0037-for-you-shelf.md`
**Test plan:** `engineering-team/stories/36-for-you-shelf.test-plan.md`

## Verdict: **PASS** (APPROVED)

The diff matches the story, the ADR, and the test plan. Every gate I ran myself is green. The
load-bearing contracts (read-time/no-cache, no-compute-when-not-personalized, one batched bounded
`weights`, qualify+exclude boundaries, honest degrade) are verified **in the code**, not just in the
tests. No masked mock. No new crypto. No Brainstorm/NIP-85 leak. Copy is no-slop clean. Test integrity
is intact (the Implementer commit touched zero test files). I found no correctness bug the tests miss.
Findings below are all non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS, zero errors.** All 9 workspace projects done clean (schemas,
  search, trust, indexer, seeder, promoter, web, shelves, api).
- [x] `pnpm -r test` — **PASS, full suite green, no regressions, no flake observed.**
  - api: **784 passed, 10 skipped** (DB/relay integration skipped — no `DATABASE_URL`/relay, expected).
    - `test/routes/foryou.test.ts` → **25 passed**
    - `test/ratings/own-rated-slugs.test.ts` → **5 passed**
    - `test/config-foryou.test.ts` → **15 passed**
  - web: **300 passed** (`test/home-foryou.test.tsx` 7, `test/foryou-api.test.ts` 3)
  - trust: **23 passed** (`architecture-foryou.test.ts` 2, `architecture.test.ts` 1 — both green)
  - shelves 26 / schemas 112 / search 11 / promoter 28 / seeder 12 / indexer 6 — all green.
  - New For-You cases total **57** green (route 25 + helper 5 + config 15 + guard 2 + web-api 3 +
    web-home 7). The Implementer report and the test-plan both say "58"; the actual committed files
    sum to 57 (route file has 25 not 24, config file has 15 not 18). **Accounting discrepancy only —
    every case is present and green.** Non-blocking; noted.
  - The `errors.test.ts` and `home-foryou.test.tsx` stderr (`internal detail that must not leak…`,
    `ECONNREFUSED 127.0.0.1:3000`) is **caught test output, not a failure** — see flagged item (2).
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build` succeed; 444
  modules; no new hex/asset bloat.
- [x] Architecture guards — `packages/trust/test/architecture.test.ts` + `architecture-foryou.test.ts`
  both green; `apps/api/test/search/architecture.test.ts` + `apps/shelves/test/architecture.test.ts`
  green.
- [x] `docker compose -f docker-compose.prod.yml config` — **valid; file untouched by this diff.**
- [ ] _Lint not configured — skipped._

---

## Spec adherence (per AC)

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** own-vantage ranking; two graphs → two shelves | **PASS** | `computeForYou` ranks by `weighted.average` desc, slug tie-break (`foryou.ts:175`); observer is `user.pubkeyHex` from the session (`foryou.ts:225,231`). Route tests pin rank-desc, two-users→two-shelves, observer==session hex, drop-untrusted, slug tie-break. |
| **AC-2** bar ≥ 4.0 AND count ≥ 2, boundary-correct | **PASS** | `foryou.ts:171-172` — `average < minAvg` excludes (4.0 inclusive), `trustedCount < minRatings` excludes. Tests pin avg-4.0/count-2 **in**, 3.9 **out**, lone 5-star (count 1) **out**, configurable bar 4.5 excludes 4.0, configurable min 3 excludes count-2. `weightedRatings` semantics confirmed (`packages/trust/src/ratings.ts`): `trustedCount`=positive-weight rater count, `average`=weighted mean. |
| **AC-3** exclude already-rated | **PASS** | `foryou.ts:168` drops `ownRatedSlugs.has(c.slug)`. Own-ratings read is author-scoped to the session hex, **no `#z`** (`foryou.ts:214`), matching `countOwnRatings`. New `ownRatedSlugs` helper (`summary.ts:93`) is the same latest-by-slug fold as `countOwnRatings`; invariant `size === booksRated` holds by construction. 5 helper tests + 2 route tests. |
| **AC-4** read-time, not cached | **PASS** | `foryou.ts` reads/writes **no** cache table, calls **no** homepage-shelves serve path, adds **no** migration (verified by grep + diff `--stat`: no `*.sql`/migrations in the diff). `ForYouDeps` has no `readShelfCache`. Computes entirely per-request. See "Read-time / no-cache verdict". |
| **AC-5** not_personalized / anonymous, no fabrication | **PASS** | `foryou.ts:197-205`: signed-out → `anonymous` (200, not 401); `!trust \|\| !lib() \|\| !hasScores` → `not_personalized` **before** any compute. Pinned: `weights` **not called** when not personalized (`foryou.test.ts:439`). Web renders invitation vs nothing per `state`. |
| **AC-6** bounded + ONE batched `weights` | **PASS** | One `await deps.trust.weights(user.pubkeyHex, raterUnion)` (`foryou.ts:225`). `boundedRaterUnion` caps at `foryouCandidateRaters` (`foryou.ts:131`). Candidate read is `queryPaged` (cap-safe). Tests pin `toHaveBeenCalledTimes(1)` + union arg + cap≤3 with `foryouCandidateRaters:3`. |
| **AC-7** honest empty / degrade, never 500 | **PASS** | `weights` wrapped in `try/catch → new Map()` (`foryou.ts:224-228`); whole body in `try/catch → next(err)` (`foryou.ts:193,258`). Thin graph and throw both → `personalized` + `[]`, 200. Tests pin all three (thin, reject→200, empty map). |
| **AC-8** fixture-CI; guards green; no Brainstorm leak | **PASS** | Whole red set runs against `FixtureTrustProvider`, no Brainstorm/relay/human. `architecture-foryou.test.ts` pins `foryou.ts` under the guard scan root + content-free of Brainstorm specifics; main guard green. Grep confirms no `setup/`, `authChallenge`, `user/graperank`, `graperankResult`, `30382`, `brainstorm_login` in `foryou.ts`. |

No acceptance criterion silently dropped. No behavior added beyond the story.

---

## ADR adherence

- Files match ADR §"Implementation notes" exactly: new `apps/api/src/routes/foryou.ts`
  (`buildForYouRouter`), registered in `apps/api/src/index.ts` beside the homepage-shelves router with
  the four named deps; four config knobs in `apps/api/src/config.ts` mirroring the `searchTrustBlend`
  block (optional-in-`Config`, `loadConfig` always sets + range-validates with house-style throw);
  `ownRatedSlugs` added next to `countOwnRatings`; `api.foryou()` + `ForYou` type in
  `apps/web/src/lib/api.ts`; `Home.tsx` fetches it and renders **above** the house shelves.
- Layering respected: web stays UI (consumes `api.foryou()`); api stays server; trust math reuses
  `@unbnd/trust` (`weightedRatings`/`dedupeRatings`) — **no new ranking/trust math**.
- The compute is factored as a pure injected-deps function (`computeForYou`, plus `buildCandidates` /
  `boundedRaterUnion`), mirroring `search/rerank.ts` as the ADR asked.
- No new dependencies (reuses `nostr-tools/nip19` `npubEncode`, `parseBook`, existing query deps). No
  new lint/build tooling.

## DList integrity

- Reads existing `kind:39999` (ratings, own-ratings) and `kind:39998`/`39999` (books header + records);
  writes nothing — no event, no cache row, no migration.
- Librarian pubkey resolved at runtime from `config.librarianPubkey` (`foryou.ts:181`); **no hardcoded
  npub/hex** (grep clean). Addresses use stable `kind:pubkey:slug` via `buildBookRatingsHeaderAddress` /
  `formatAddress` / `39998:<lib>:books` — identical to `homepage-shelves.ts` / `apps/shelves/compute.ts`.

## UI integrity

- Brand tokens only (`var(--u-muted)`, `var(--u-amber)`, `var(--u-amber-hover)`, `var(--u-ink)` in
  `Shelf.css`); **no new hex literal**. No icon library, no emoji, no spinner. Reuses `Shelf`/`BookCard`,
  no new layout. The invitation button reuses the shipped `useTrustView().personalize` trigger (no new
  route).
- **No trust number / tier / "trusted" badge** on any For-You card — pinned at the API (wire-hygiene
  test asserts no `graperank`/`trusted`/`tier`/`weight`/`average`/`trustedCount` in the body) and the
  web (`home-foryou` asserts no `top N%`/`graperank`/`trusted` in the section).
- **Copy (no-slop check, PASS):** Heading `For you`; body `Build your web of trust and this shelf fills
  with books the curators you follow rate highly.`; button `Personalize your view`. No em dash, no
  rhetorical contrast/declarative negative, no hedged opener, no banned filler verb, no emoji, no
  exclamation. Plain Anglo-Saxon verbs (Build/fills/follow/rate). Clean.

---

## The masked-mock check — **VERDICT: NO MASKED MOCK**

The class of bug that BLOCKED Stories 30 + 32 is absent here.

- The web `ForYou` type is `{ state; books: PublicBook[] }` (`apps/web/src/lib/api.ts`). The route
  literally returns `res.status(200).json({ state, books })` where `books` is produced by `parseBook`
  → `toPublicBook` (`apps/api/src/books/effective.ts`). The web `PublicBook` and the API `PublicBook`
  are structurally identical (same 13 fields; both reuse the same shape the rest of the homepage
  consumes via `toCardBook`).
- The web believes in **no field the server never sends**: it reads only `state` and `books`. The
  route emits exactly `state` and `books`.
- The route tests assert the **real** body — `res.body.state`, `res.body.books`,
  `res.body.books.map(b => b.slug)`, and `toMatchObject({ slug, title })` over the hydrated book — not
  a fabricated shape. `api.foryou()` is typed to the real exported `ForYou`, and the web test fixtures
  are built with `satisfies ForYou`, so a drift between the type and the api return stops compiling
  (the masked-mock guard the Tester built in). The web Home test mocks the **api client method**, not
  the network and not the component under test, with fixtures typed to the real contract.

The wire→web contract is tied to the real route response. APPROVED on this axis.

---

## Read-time / not-cached verdict — **VERIFIED IN CODE (the load-bearing constraint)**

- `foryou.ts` contains **no** reference to `homepage_shelves`, `readShelfCache`, any cache table, or any
  migration (grep: the only matches for those words are in the negating header comment). The diff adds
  **no** `*.sql` / migration file (`git diff --stat` clean).
- The route computes entirely per request from `user.pubkeyHex`: session resolve → `hasScores` gate →
  `queryPaged` candidate-ratings + own-ratings (in parallel) → one `weights` call → `computeForYou` →
  `#d` hydrate → JSON. There is no precomputed-row read anywhere on the path.
- `ForYouDeps` deliberately omits `readShelfCache` (pinned by `foryou.test.ts:418`
  `expect(deps).not.toHaveProperty("readShelfCache")`). `apps/shelves`, `homepage-shelves.ts`, and the
  Story-35 migration are untouched (diff `--stat` clean). The house cache stays the only per-POV
  denormalization, and it stays one-POV. ADR 0036's invariant-3 boundary is honored verbatim.

## Degrade / contract verdict — **VERIFIED**

- `not_personalized` does **zero** trust work: the gate at `foryou.ts:203` short-circuits to a JSON
  return before the candidate read or any `weights` call. Pinned by the `weights not called` assertion.
- `weights` failure cannot 500: it is wrapped `try { weights = await … } catch { weights = new Map() }`
  (`foryou.ts:224-228`); an empty map makes every `weightedRatings` return `null` → zero qualifiers →
  `personalized` + `[]`, 200. The whole route body is additionally wrapped `try/catch → next(err)`.
  A thin graph and a provider throw both degrade to the same honest empty. Pinned (reject→200, empty
  map→empty, thin→empty). Never fabricates/pads — the books array is built only from qualifying slugs.

---

## Three flagged items — adjudicated

1. **The three previously-vacuous web negatives — NOW CARRY REAL SIGNAL.** With the feature landed,
   the render is gated by real conditionals in `Home.tsx`:
   `state.foryou.state === "personalized" && state.foryou.books.length > 0` (shelf) and
   `state.foryou.state === "not_personalized"` (invitation). The three negatives now exercise these:
   - **anonymous** → neither guard fires; if a shelf had been rendered for anonymous the
     `queryByText(/^for you$/i)` assertion would fail. Real signal.
   - **personalized + empty** → the `books.length > 0` guard suppresses the shelf; **drop that length
     check and this case fails** (an empty "For you" would render). This is the strongest of the three
     and pins the honest-empty contract against a real off-by-one.
   - **fetch-failure** → `.catch(() => EMPTY_FORYOU)` degrades to `anonymous`; remove the catch and the
     whole page errors and `recently added` would not render. Real signal.
   No longer vacuous. Non-blocking.

2. **`useTrustView` / `api.trust.status()` `ECONNREFUSED` in the Home test — HARMLESS, not a CI risk.**
   `Home` now mounts `useTrustView()`, which calls the un-mocked `api.trust.status()` (and `useSession`),
   hitting `localhost:3000` in jsdom. The `ECONNREFUSED` lines are **stderr noise**: every call site is
   `.catch()`-handled (`useTrustView.ts:80`, `:90`), so vitest reports **no `Unhandled Rejection`** and
   the file passes 7/7 deterministically across repeated runs. It will not fail CI under the current
   config. Non-blocking; recommended follow-up: stub `api.trust.status` (and `api.session`) in
   `home-foryou.test.tsx` to silence the noise.

3. **Candidate-rater cap determinism — DETERMINISTIC; minor divergence from ADR wording, non-blocking.**
   `buildCandidates` sorts candidates slug-ascending; `boundedRaterUnion` walks that order keeping
   first-seen raters until the cap. **Fully deterministic** (slug-ordered, first-seen-kept), satisfying
   the ADR's binding requirement (bounded + deterministic) and matching what the Implementer flagged.
   The ADR §2.2 prose says "raters appearing across the **most-rated books first**" — the
   implementation uses slug-order instead, so *which* raters survive truncation differs from that
   heuristic on a future dense graph. On today's thin graph the cap is a no-op, and the heuristic was an
   optimization, not a correctness guarantee. Non-blocking; worth a one-line ADR note if the most-rated
   ordering is later wanted.

## `author-edits.test.ts` transient-flake assessment — **PRE-EXISTING / UNRELATED; did not reproduce**

Ran `routes/author-edits` 3× in isolation and once in the full suite: **18/18 passed every time.** The
For-You diff adds a new route, new config, a new `summary.ts` helper, and web shelf wiring — it does
**not** touch author-edits, its fixtures, or any shared module author-edits depends on
(`b3fdbe1 --stat` confirms no overlap). The reported flake is not caused by this change. No action.

## Test-integrity audit — **PASS (no weakening)**

- `git show --stat b3fdbe1` (Implementer) touched **only** the 7 source files — **zero test files**.
  All 6 test files were authored in the Tester's `284bcbd` and are unchanged by `b3fdbe1`.
- No test skipped/deleted/weakened. The neighboring suites (config, ratings, homepage-shelves, search)
  remain green.
- Non-tautological: the qualify boundaries assert real cut behavior (4.0 in / 3.9 out / count-1 out /
  count-2 in / configurable bar+min move the cut); two-graphs asserts two *different* slug lists from
  one catalog; no-weights-when-not-personalized uses a real spy `not.toHaveBeenCalled()`; degrade
  asserts 200 + empty after a real `mockRejectedValue`. Config tests assert defaults, overrides,
  boundaries, and rejects. No masked/tautological assertion found.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **Case-count accounting:** report/test-plan say 58 new cases; the committed files sum to 57 (route
   25, config 15). Cosmetic — update the test-plan tally.
2. **Test noise:** `home-foryou.test.tsx` emits `ECONNREFUSED` stderr because `useTrustView`'s
   `api.trust.status()` / `useSession` are un-mocked. Caught, not failing. Stub them to silence.
3. **ADR wording vs cap policy:** `boundedRaterUnion` truncates in slug order, not the ADR's
   "most-rated books first." Deterministic and correct; add an ADR note (or adopt most-rated ordering)
   before the graph densifies.
4. **Memoization follow-up** (already recorded in ADR Consequences): pure read-time recomputes every
   personalized homepage load; revisit a short-TTL per-user memo only if measured cost warrants — never
   a precomputed per-POV cache.

## Scope / firewall
- Engineering-only review. No product/PRD-scope changes. Diff touches none of PRD §11.3 "Out of Scope"
  (no payments, file hosting, ebook sales, bounty, print, social feed, reading progress, federation,
  email). House shelves (Story 35), search (Story 34), and the Personalize trigger are untouched.
  POV-first / decentralized-first / filter-at-view-time respected.

---

## Verdict: **PASS / APPROVED**

Story 36 is mergeable as committed at `b3fdbe1`. Per the Reviewer role I **STOP at the review gate** —
I do not merge and do not push. Story close-out (Status: Done, `git mv` to `done/`, path updates) is
deferred to the merge/closeout step per instructions.

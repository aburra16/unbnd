# Test Plan: Story 28 — Your rating: surface the signed-in user's own rating + in-place edit

**Story:** `engineering-team/stories/done/28-your-rating-surface-edit.md`
**ADR:** `engineering-team/decisions/0029-your-rating-surface-edit.md`
**Date:** 2026-06-01
**Branch:** `feat/your-rating-edit`

Phase: Test Design. These tests are intentionally RED until the feature is built.
They pin the contract from the story's 8 ACs and ADR 0029's decisions (the additive
`yourRating` field, the shared `useBookRatings` hook, the controlled `RatingControl`
with prefill / "Update rating" framing, and the optimistic + reconcile + rollback
flow including the custodial reauth case). Gate decisions honored: un-rate is OUT
(Story 28b — no removal is tested); AC-4 is calm/in-place (a test asserts NO confirm
modal appears).

## Coverage map

Every AC maps to at least one test. New tests live in two new web files and one
extended API file.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (surface, filled stars + label + review) | `signed-in + has-rated: renders a 'Your rating' zone, stars filled to the score, the review, and the date line` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-1 (own read source = raw, not weighted) | `returns the caller's own rating as 'yourRating', sourced from the raw set` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| AC-2 ("You rated on <date>") | `signed-in + has-rated: … the date line` (asserts `You rated this on` + `2026-05-20`) | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-2 (not-rated → no date line, empty control) | `signed-in + not-rated: empty interactive control, no date line, no filled own-stars` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-3 (honesty: identical under House⇄Yours, component) | `renders the same score, date, and review whether the active view is House or Yours` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-3 (honesty: own read survives the toggle, data) | `keeps yourRating identical and present across a House⇄Yours toggle (AC-3 honesty)` | `apps/web/test/hooks/use-book-ratings.test.tsx` | hook |
| AC-3 (honesty seam, API) | `is present even when the caller's own rating is ABSENT from the weighted set (honesty seam)` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| AC-3 (observer-independence, API) | `is observer-independent: identical 'yourRating' regardless of ?observer=` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| AC-4 (prefill + "Update rating" + calm line, no modal) | `has-rated: prefilled, button reads 'Update rating', quiet already-rated line, no confirm dialog` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-4 (first-rating framing) | `not-rated: button reads 'Submit rating', no already-rated line` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-5 (replace via existing sovereign path) | `sovereign edit: runs template → signEvent → submit (the shipped sovereign path)` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-5 (one current rating at the new score, no duplicate) | `after a successful edit, reconciles to exactly ONE current rating at the new score (no duplicate)` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-6 (optimistic fill before resolve) | `fills the own-rating stars to the new score immediately, before the publish resolves` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-6 (reconcile via one applyWrite, both slices) | `updates the aggregate AND yourRating in one step (no two-component race)` | `apps/web/test/hooks/use-book-ratings.test.tsx` | hook |
| AC-6 (rollback + honest error, no false saved/toast) | `on publish failure, rolls back to the prior score and shows an honest in-place error (no false 'saved', no toast)` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-6 (quiet success confirmation, not alarmist) | `on success, shows a quiet in-place confirmation (role=status), not an alarmist warning` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-7 (sovereign tier) | `sovereign edit: runs template → signEvent → submit …` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-7 (custodial tier) | `custodial edit: runs submitCustodial with no extension (the shipped custodial path)` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-7 (custodial reauth_required → honest prompt + rollback) | `custodial reauth_required (401): shows an honest 'sign in again' message and rolls back` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-8 (signed-out: no zone, sign-in prompt) | `signed-out: no 'Your rating' zone, no prefilled control, the sign-in prompt renders` | `apps/web/test/components/rating-control-your-rating.test.tsx` | component |
| AC-8 (signed-out: yourRating null, hook) | `yourRating is null for a signed-out visitor` | `apps/web/test/hooks/use-book-ratings.test.tsx` | hook |
| 500-cap fallback (ADR §1, AC-1/AC-3 safety) | `past the 500-cap: invokes the author-scoped fallback query and still populates yourRating` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| Anonymous read → null | `yourRating is null for an anonymous request (no session cookie)` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| Never-rated → null | `yourRating is null for a signed-in user who has never rated this book` | `apps/api/test/routes/ratings.test.ts` | route (DI) |
| Hook: one fetch per (slug, view) owner | `fetches the house summary once on mount and exposes it`; `fetches the 'yours' vantage only when view==='yours' and an npub is present` | `apps/web/test/hooks/use-book-ratings.test.tsx` | hook |
| Hook: own-rating derives from raw/house | `derives yourRating from the house/raw read, NOT the trust-weighted subset`; `falls back to scanning raw ratings by npub when house.yourRating is absent` | `apps/web/test/hooks/use-book-ratings.test.tsx` | hook |

## Test files

- **NEW** `apps/web/test/hooks/use-book-ratings.test.tsx` — 8 tests. The shared
  `useBookRatings(slug)` owner (ADR §3). Asserts house-fetch-once, yours-only-when-
  yours+npub, own-rating-from-raw (and the `house.ratings.find(npub)` fallback),
  honesty across a toggle, signed-out → null, and `applyWrite` reconciling both
  slices from one source.
- **NEW** `apps/web/test/components/rating-control-your-rating.test.tsx` — 13 tests
  (3 are green-now contracts for the preserved not-rated / signed-out branches; 10
  are red). The controlled `RatingControl` as the unified display + in-place editor.
- **EXTENDED** `apps/api/test/routes/ratings.test.ts` — 6 new tests in a new
  `describe("GET /api/books/:slug/ratings — yourRating …")` block. The existing 12
  tests are untouched and remain green.

Total: 6 new API tests, 21 new web tests (across 2 new files). 16 of the web tests
are red, 5 are green-now (preserved-behavior contracts for never-rated / signed-out
that must STAY green after implementation); 1 of the 2 new web files fails to import
(`useBookRatings` not built yet — the right not-implemented red).

## How the 500-cap fallback and the honesty seam are asserted (API)

These are the two subtle correctness guarantees ADR 0029 §1/§2 calls out.

- **Honesty seam (own rating present even when absent from `weighted`).** Test
  `is present even when the caller's own rating is ABSENT from the weighted set`
  injects a trust provider that weights ONLY the other rater (`weights = {[other]:
  0.9}`), so the caller's own rating carries no weight and is excluded from
  `weighted.ratings`. The test asserts both: (a) the own npub is NOT in
  `weighted.ratings`, and (b) `yourRating` still equals the caller's own entry. This
  pins that `yourRating` is sourced from `raw`/own, never the trust-filtered subset.
  A sibling test (`is observer-independent`) hits the same route with and without
  `?observer=` and asserts `yourRating` is byte-identical across both.

- **500-cap author-scoped fallback.** The route reads via the un-paginated
  `queryEvents` (strfry per-REQ cap 500). When the user's own rating falls outside
  the truncated page, ADR §1 specifies a targeted author-scoped read. Test
  `past the 500-cap: invokes the author-scoped fallback query …` injects `query` as
  a **brancher**: the book-address read (`#a` only, no `authors`) returns a set that
  does NOT contain the caller's own event; the author-scoped read (carrying
  `authors`) returns the own event. The test asserts (a) a query call WAS made whose
  filter has `authors`, (b) that filter is `{ kinds:[39999], authors:[ownHex],
  "#a":["39999:<librarian>:orbital"] }`, and (c) `yourRating` is populated despite
  the own rating being outside the capped page. This injects the `query` dep exactly
  as the existing weighted tests inject `query`/`trust` — no live relay.

Deterministic own keypair: `generateSecretKey`/`getPublicKey`/`npubEncode` from
nostr-tools (audited `@noble` floor per the crypto policy — no hand-rolled crypto).
The session user's `pubkeyHex` is set to that hex so the route's hex match resolves
to the fixture's own rating; `toPublic` emits the matching npub back to the client.

## Copy assertions (no-slop rule)

The new strings are asserted exactly where reasonable, and screened against
`memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no rhetorical contrast, no
emoji, no celebratory toast):

- `"Your rating"` — the zone label (asserted via `getByRole("group", { name:
  /your rating/i })`).
- `"You rated this on 2026-05-20. Saving will update it."` — asserted as an exact
  string. Plain, period-terminated, no em dash.
- `"Update rating"` (has-rated) vs `"Submit rating"` (not-rated) — asserted by
  role-scoped button name, not page-wide substring.
- Custodial reauth copy — asserted via `/sign in again to update/i` inside the
  `role="alert"`. The implementer's final wording must contain that phrase and stay
  no-slop.
- Success confirmation is asserted as a `role="status"` element (quiet, in place),
  NOT a toast; failure is `role="alert"` with no `role="status"` present (no false
  "saved").

## Determinism / patterns

- Boundary mocks only: `api`, `useSession`, `useTrustView` (web) and the injected
  `sessionUser` / `publish` / `query` deps (API). No intra-module `vi.mock` of the
  unit under test. Mirrors `rating-control.test.tsx`, `ratings-panel.test.tsx`,
  `use-trust-view.test.tsx`, and `ratings.test.ts`.
- Role-scoped Testing Library queries (`getByRole` textbox/button/group/status/
  alert with specific names). No brittle page-wide `/save/i` substring queries.
- No live relay, no network, no real crypto in the web tests; fixed dates/scores in
  every asserted output (no `Date.now()` in assertions).
- The optimistic-before-resolve test uses a deferred promise (`submit` returns a
  never-yet-resolved Promise) to assert the stars fill BEFORE the publish settles.

## Edge cases covered

- [x] Anonymous GET → `yourRating: null` (no session).
- [x] Signed-in but never-rated → `yourRating: null` (API) and empty control (web).
- [x] Own rating outside the 500-cap page → author-scoped fallback fires.
- [x] Own rating carries no trust weight (absent from `weighted`) → still surfaced.
- [x] Publish/read-back failure → rollback + honest in-place error, no false "saved".
- [x] Custodial `reauth_required` (401) → honest "sign in again" + rollback.
- [x] House⇄Yours toggle → own-rating zone unchanged (component + hook + API).
- [x] `house.yourRating` absent (old/uncapped shape) → client falls back to scanning
      `raw.ratings` by npub.
- [ ] Out of scope, NOT tested: un-rate / removal (Story 28b); any confirm modal
      (gate decision: a test asserts NO `role="dialog"` and no `/overwrite/i` appear).

## Migrated to the controlled-props contract (red set now COMPLETE)

The four existing test files that encoded the OLD self-fetch behavior have now
been migrated to the ADR 0029 controlled-props contract (same prop shapes/mocks
as `rating-control-your-rating.test.tsx` and `use-book-ratings.test.tsx` — one
coherent contract across all web tests). They are intentionally RED until the
Implementer lands the controlled refactor (drops the components' own
`api.ratings.list` effects, accepts the new props, and wires `applyWrite`); the
red is "feature not built", NOT a test bug. With these four migrated, the full
Story-28 web red set is complete.

- `apps/web/test/components/ratings-panel.test.tsx` — **migrated.** Old: mocked
  `api.ratings.list`, asserted the panel fetched the house summary on mount and
  the `yours` vantage on the toggle. New: the panel is controlled — rendered with
  `house`/`yours`/`status` PROPS; the same render behaviors are preserved (house
  weighted render, raw fallback, Personalize trigger, building note, Yours
  vantage render + label, toggle → `setView`) plus a new `status="loading"`
  case. `useTrustView` still owns the toggle chrome. RED now because the panel
  ignores the props and renders from its own (null) self-fetch state.
  - **Assertion moved:** the old `ready + Yours` test asserted
    `expect(listMock).toHaveBeenCalledWith("b1", "npub1me")` — i.e. the panel
    *fetches* the observer vantage. That fetch responsibility moved to the hook;
    it is now covered by `use-book-ratings.test.tsx` → "fetches the 'yours'
    vantage only when view==='yours' and an npub is present". The panel test
    re-expresses the *guarded behavior* as: the panel RENDERS the `yours` slice
    it is handed and labels it "Your perspective" (no fetch assertion).

- `apps/web/test/components/rating-control.test.tsx` — **migrated.** Old: mocked
  `api.ratings.list` (self-fetch on mount) and rendered `<RatingControl
  bookSlug>` with no rating props. New: controlled — rendered with `yourRating`
  (never-rated default `null`) + `applyWrite`. Preserved: sovereign first-rating
  path (`template → signEvent → submit`), the signed-out sign-in prompt, and the
  custodial-renders-control gate. Added: a reconcile-via-`applyWrite` assertion
  (the control hands the saved summary + own rating to `applyWrite` instead of
  `setSummary`). RED now only on the `applyWrite` reconcile test (component still
  `setSummary`s); the three preserved-behavior tests stay GREEN.

- `apps/web/test/components/rating-control-custodial.test.tsx` — **migrated.**
  Same shape: controlled props, `list` kept in the boundary mock for parity.
  Preserved: the custodial server-side-submit contract (`submitCustodial`, no
  extension, no sovereign endpoints). Added: the `applyWrite` reconcile
  assertion (RED now; the preserved submit test stays GREEN).

- `apps/web/test/book-detail-trust-view.test.tsx` — **migrated.** Old: mocked
  `api.ratings.list` (the sibling components each self-fetched). New: mocks the
  shared `useBookRatings(slug)` owner, since BookDetail now calls it once and
  passes slices down. POV/observer intent is preserved verbatim: the AC-5
  assertion that the tag read carries the active observer
  (`tagsBook` called with `("orbital", YOURS_NPUB)`) is unchanged and stays
  GREEN. Added: an assertion that BookDetail drives the page from the single
  `useBookRatings("orbital")` owner (one read, not sibling self-fetches) — RED
  until BookDetail calls the hook.

No assertion was silently dropped. The one fetch-on-mount assertion that no
longer applies to the panel (its data fetch moved to the hook) was relocated to
`use-book-ratings.test.tsx` as noted above, and the panel test re-expresses the
behavior it ultimately guarded (rendering the right vantage slice).

## Test infrastructure

- Runner: Vitest. Web tests under `apps/web/test/`; API tests under
  `apps/api/test/`. Component/hook tests use `@testing-library/react`.
- No `docker compose` dependency: every test is DI/boundary-mocked. No strfry,
  Neo4j, or Meilisearch needed.
- No new framework, no Playwright (no ADR introduces it).

## How to run

```
pnpm --filter @unbnd/web test -- --run test/hooks/use-book-ratings.test.tsx test/components/rating-control-your-rating.test.tsx
pnpm --filter @unbnd/api test -- --run test/routes/ratings.test.ts
pnpm -r test
```

## Verification (intentionally RED)

Confirmed on 2026-06-01, branch `feat/your-rating-edit`. The new tests fail because
the feature is not implemented (the `yourRating` field, the "Your rating" zone, the
prefill / "Update rating" framing, the `useBookRatings` hook, and the optimistic /
reconcile / rollback wiring do not exist yet) — NOT because of test bugs.

### API — `apps/api/test/routes/ratings.test.ts`

```
 Test Files  1 failed (1)
      Tests  6 failed | 12 passed (18)

 × … > returns the caller's own rating as `yourRating`, sourced from the raw set
     → expected undefined to match object { …(4) }
 × … > is observer-independent: identical `yourRating` regardless of ?observer=
     → expected undefined to match object { …(2) }
 × … > is present even when the caller's own rating is ABSENT from the weighted set (honesty seam)
     → expected undefined to match object { …(2) }
 × … > past the 500-cap: invokes the author-scoped fallback query and still populates yourRating
     → expected undefined to be defined        (the author-scoped fallback query is never invoked)
 × … > yourRating is null for an anonymous request (no session cookie)
     → expected undefined to be null
 × … > yourRating is null for a signed-in user who has never rated this book
     → expected undefined to be null
```

Every API failure is `res.body.yourRating === undefined` (the additive field is not
emitted) — a clean not-implemented red. The 12 existing GET/POST/template tests stay
green.

### Web — new files

```
 Test Files  2 failed (2)
      Tests  10 failed | 3 passed (13)

 FAIL  test/hooks/use-book-ratings.test.tsx
   Error: Failed to resolve import "../../src/hooks/useBookRatings" — Does the file exist?
   (the shared hook is a new file the Implementer creates; all 8 hook tests are
    blocked on the missing module — the right not-implemented red.)

 × RatingControl — AC-1/AC-2 … renders a 'Your rating' zone … (no group[name=Your rating], no prefill, button says "Submit rating")
 × RatingControl — AC-3 … identical under House and Yours …
 × RatingControl — AC-4 … button reads 'Update rating', quiet already-rated line …
 × RatingControl — AC-5/AC-7 … sovereign edit: template → signEvent → submit …
 × RatingControl — AC-5/AC-7 … custodial edit: submitCustodial …
 × RatingControl — AC-5/AC-7 … reconciles to exactly ONE current rating at the new score …
 × RatingControl — AC-6 … fills the own-rating stars to the new score immediately …
 × RatingControl — AC-6 … rolls back … honest in-place error (no false 'saved', no toast) …
 × RatingControl — AC-6 … quiet in-place confirmation (role=status) …
 × RatingControl — AC-7 … custodial reauth_required (401) … 'sign in again' … rolls back …
 ✓ RatingControl — AC-2 … not-rated: empty control, no date line          (preserved behavior — stays green)
 ✓ RatingControl — AC-4 … not-rated: button reads 'Submit rating'          (preserved behavior — stays green)
 ✓ RatingControl — AC-8 … signed-out: sign-in prompt, no zone              (preserved behavior — stays green)
```

The full suites confirm the red is isolated: `pnpm --filter @unbnd/api test` →
`6 failed | 558 passed | 10 skipped`; `pnpm --filter @unbnd/web test` →
`10 failed | 170 passed` (only the two new files fail).

### Web — after migrating the four existing files to the controlled contract

After migrating `ratings-panel.test.tsx`, `rating-control.test.tsx`,
`rating-control-custodial.test.tsx`, and `book-detail-trust-view.test.tsx` to the
controlled-props contract, `pnpm --filter @unbnd/web exec vitest run` reports:

```
 Test Files  6 failed | 32 passed (38)
      Tests  16 failed | 168 passed (184)
```

The 6 failing files are exactly the Story-28 red set: the 2 new files
(`use-book-ratings.test.tsx` — module not built; `rating-control-your-rating.test.tsx`
— control not controlled) plus the 4 migrated files. All 32 other (non-rating)
web test files stay green. Per-migrated-file red reasons (all "feature not
built", not test bugs):

- `use-book-ratings.test.tsx` — `Failed to resolve import "../../src/hooks/useBookRatings"`.
- `ratings-panel.test.tsx` — 3 red (house-only 4.5 / raw-fallback 3.0 / Yours 2.0):
  the panel renders from its own self-fetch null state, ignoring the `house`/`yours`
  props. 4 green (loading note, Personalize, building note, toggle→setView).
- `rating-control.test.tsx` — 1 red (`applyWrite` not called; still `setSummary`).
  3 green (sovereign first-rating path, signed-out prompt, custodial control renders).
- `rating-control-custodial.test.tsx` — 1 red (`applyWrite` not called). 1 green
  (custodial `submitCustodial` path).
- `book-detail-trust-view.test.tsx` — 1 red (`useBookRatings("orbital")` not called
  yet). 1 green (AC-5: tag read carries the observer — intent preserved).

### Typecheck (the two intentional not-implemented contract errors)

`pnpm --filter @unbnd/web exec tsc --noEmit` surfaces exactly two errors, both the
contract the Implementer fulfills (mirrors how `book-detail-trust-view.test.tsx` was
authored red):

```
rating-control-your-rating.test.tsx: RatingControl is missing props `yourRating` / `applyWrite`
use-book-ratings.test.tsx: Cannot find module '../../src/hooks/useBookRatings'
```

(Vitest transpiles per-file without project typecheck, so these don't mask the
runtime red — they reinforce it.)

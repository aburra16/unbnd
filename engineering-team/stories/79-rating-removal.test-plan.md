# Test Plan: Story 79 — Remove a rating

**Story:** `engineering-team/stories/79-rating-removal.md`
**ADR:** `engineering-team/decisions/0077-rating-removal.md`
**Date:** 2026-06-09

## Coverage map
Four layers: the WIRE contract (retraction shape + the shared predicate), the FOLDS (all five read seams), the ENDPOINTS (tier-branched + idempotent), and the web AFFORDANCE.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| Retraction wire contract (same d-tag, marker, no score, routing tags) | the 4 `buildBookRatingRetraction` tests | `packages/schemas/test/BookRatingRetraction.test.ts` | unit |
| The shared fold predicate | the 3 `isRatingRetraction` tests (built retraction / normal rating / wrong kind) | same | unit |
| AC-3 seams 1–2 (summary raw+weighted, yourRating) | `a retraction newer than the rating drops the rater from the deduped set` + the 3 siblings | `packages/trust/test/retraction.test.ts` | unit |
| AC-3 seam 3 (profile counts) | `a retracted rating drops out of booksRated AND reviews` | `apps/api/test/ratings/summary-retraction.test.ts` | unit |
| AC-3 seam 4 (For-You exclusion) | `a retracted book leaves the rated set …` | same | unit |
| AC-3 seam 5 (taste-match) | the `scoreBySlug` / `scoresByAuthor` tests | same | unit |
| AC-1 (remove from the product, per tier) | sovereign `publishes a valid self-signed retraction …` + custodial `server-signs the retraction …` | `apps/api/test/routes/ratings-remove.test.ts` | integration |
| AC-2 (only the rater; not anon) | `403 when the retraction is signed by a different key` + the two `401 when there is no session` tests | same | integration |
| AC-4 (idempotent; re-rate restores) | `200 { removed: false } and NO publish when the caller has no current rating` + fold tests `re-rating after a retraction counts again` / `… (re-rate) restores the current rating` | api + trust | integration + unit |
| AC-5 (auditable signed event) | structural: the sovereign path publishes the caller's self-signed event; custodial signs with the session key (`custodialSign` asserted); validated in review | — | review |
| AC-6 (deliberate, not fat-fingerable; edit unchanged) | the confirm-gate tests (`… gated by a confirm step (no api call before confirm)` + `'Keep it' returns …`) + existing edit suites untouched | `apps/web/test/components/rating-control-remove.test.tsx` | component |
| Web per-tier flows + cleared reconcile | `sovereign confirm: removeTemplate -> signEvent -> removeSubmit …` + `custodial confirm: …` (applyWrite called with `null` own rating) | same | component |
| Template endpoint | `returns a retraction template …` (d-tag, marker, no score) + `401` | api routes | integration |

## Edge cases
- [x] **Folding-in, not skipping** (the ADR's headline bug-guard): a retraction must WIN the created_at race — the fold tests place the retraction newer than the rating and assert the rating is gone (a skip-style impl leaves the old rating counting and fails these).
- [x] **Re-rate restores** across folds (trust + countOwnRatings + scoreBySlug): rating → retraction → rating = one current rating at the new score.
- [x] **Isolation**: one rater's retraction never affects another rater (dedupe + scoresByAuthor).
- [x] **Retraction with no prior rating**: empty result, not a crash.
- [x] **Idempotent + relay-cap**: no current rating → `removed:false`, publish NOT called.
- [x] **Not-a-retraction guard**: a valid self-signed *rating* posted to /remove → 400 (publish not called).
- [x] **Custodial reauth branch reuse**: live key gone → `401 reauth_required` (publish not called).
- [x] **Confirm-gated affordance**: no api call before confirm; "Keep it" cancels cleanly; the action is absent for not-rated and signed-out users.
- **Relay-replace realism**: the route harness's query mock returns the retraction INSTEAD of the rating after publish (kind 39999 is parameterized-replaceable), so the recomputed summary honestly excludes the removed rating.

## Test infrastructure
- Vitest. Schemas: pure builders. Trust + api folds: wire-realistic signed fixtures via `finalizeEvent` (`signedRetraction` added to `apps/api/test/ratings/_fixtures.ts`; the trust test hand-rolls its own) — retraction fixtures are HAND-ROLLED, not built with `buildBookRatingRetraction`, so they pin the wire contract independent of the builder under test. Routes: express + supertest + the stateful relay-replace query mock. Web: `useSession`/`useTrustView`/`api` mocked; NIP-07 `signEvent` stubbed on `window.nostr`.
- Stubs (red): `buildBookRatingRetraction` returns a d-tag-only event; `isRatingRetraction` returns false; the two remove endpoints return 501. Typecheck-clean — the set fails on assertions, not tsc (the PR-#74 rule).

## How to run

```
pnpm --filter @unbnd/schemas exec vitest run test/BookRatingRetraction.test.ts
pnpm --filter @unbnd/trust exec vitest run test/retraction.test.ts
pnpm --filter @unbnd/api exec vitest run test/ratings/summary-retraction.test.ts test/routes/ratings-remove.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/rating-control-remove.test.tsx
pnpm -r typecheck
```

## Verification
The new tests fail against the stubs. Confirmed 2026-06-09:

```
 ❯ packages/schemas  test/BookRatingRetraction.test.ts          (7 tests | 3 failed)
 ❯ packages/trust    test/retraction.test.ts                    (4 tests | 3 failed)
 ❯ apps/api          test/ratings/summary-retraction.test.ts    (5 tests | 4 failed)
 ❯ apps/api          test/routes/ratings-remove.test.ts         (9 tests | 9 failed)
 ❯ apps/web          test/components/rating-control-remove.test.tsx (5 tests | 4 failed)
```

(The handful that already pass are negative-space pins that hold against today's code: the predicate's false cases, the stub's d-tag/payload identity, "retraction alone parses to empty", and "not-rated/signed-out shows no Remove action".)

`pnpm -r typecheck` clean. No regressions: only the five new files fail (schemas 157, trust 41, api 963, web 376 existing tests all pass).

# Test Plan: Story 66 — Taste Match on book detail, and taste-sorted raters

**Story:** `engineering-team/stories/66-taste-match-book-detail.md`
**ADR:** `engineering-team/decisions/0065-taste-match-book-detail.md`
**Date:** 2026-06-06

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (byline shows match) | `per-rater match keyed by npub … self excluded` | `apps/api/test/routes/book-taste-matches.test.ts` | route |
| AC-1 | `shows a match chip only on raters whose match clears the threshold` | `apps/web/test/components/taste-match-book-detail.test.tsx` | component |
| AC-2 (sort) | `sortRatingsByTasteMatch orders matched by % desc, then unmatched in original order` | `apps/web/.../taste-match-book-detail.test.tsx` | unit |
| AC-2 | `shows the Best-taste-match sort control when signed in` + `clicking … calls onSortChange('match')` | `apps/web/.../taste-match-book-detail.test.tsx` | component |
| AC-3 (default trusted) | the sort helper keeps unmatched raters in their original (trust) order; the control is handed `sortBy:"trusted"` by default | `apps/web/.../taste-match-book-detail.test.tsx` | unit + component |
| AC-4 (below threshold → no chip) | `shows a match chip only on raters whose match clears the threshold` (exactly one chip) | `apps/web/.../taste-match-book-detail.test.tsx` | component |
| AC-4 | `R2 (3 co-rated) → thresholdMet:false` | `apps/api/test/routes/book-taste-matches.test.ts` | route |
| AC-5 (hidden signed-out) | `signed out → { signedIn:false } and no reads` | `apps/api/test/routes/book-taste-matches.test.ts` | route |
| AC-5 | `does not show the sort control when signed out (no tasteMatches)` | `apps/web/.../taste-match-book-detail.test.tsx` | component |

## Edge cases

- [x] `scoresByAuthor` groups by author, keeps latest score per (author, book), skips malformed (`apps/api/test/ratings/score-by-author.test.ts`).
- [x] Batched read shape: the viewer + the book's raters are resolved in ONE author-scoped read (route test asserts the author set).
- [x] Best-effort: a read failure degrades to `{ signedIn:true, matches:{} }` (200), never a 500 (route).
- [x] Configurable `TASTE_MATCH_MIN_OVERLAP` honored (route).
- [x] Self exclusion: the viewer never appears in their own matches map (route).

## Test infrastructure

- Runner: Vitest. Unit in `packages`/`apps/web`, route in `apps/api/test/routes` (express + supertest + injected `sessionUser`/`query`/`queryPaged`, mirroring `foryou.test.ts`), component in `apps/web/test/components` (Testing Library; `vi.mock` of `useProfileMeta` + `useTrustView` + `../../src/lib/api`).
- Fixtures: signed kind-39999 ratings via `apps/api/test/ratings/_fixtures.ts` with fixed secret keys so the viewer and each rater have stable pubkeys/histories.
- No live relay, no real crypto in component tests, no network.

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/ratings/score-by-author.test.ts test/routes/book-taste-matches.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/taste-match-book-detail.test.tsx
pnpm -r test
pnpm -r typecheck
```

## Verification

The new feature tests fail with the current (stub) code, for the right reason (assertions/behavior, not imports), and the workspace typechecks clean with no existing test regressed. Confirmed 2026-06-06 (pre-implementation):

```
apps/api  test/ratings/score-by-author.test.ts        3 failed (3)  — scoresByAuthor returns an empty Map (stub)
apps/api  test/routes/book-taste-matches.test.ts       5 failed (5)  — route returns 501 (stub)
apps/web  test/components/taste-match-book-detail.test.tsx  4 failed | 1 passed (5)
           (the 1 pass is the signed-out "no sort control" guard — already true of the stub)

apps/api full suite: 2 failed | 97 passed | 2 skipped (only the two new files fail)
apps/web full suite: 1 failed | 55 passed (only the new file fails)
pnpm -r typecheck → EXIT 0 (12 packages)
```

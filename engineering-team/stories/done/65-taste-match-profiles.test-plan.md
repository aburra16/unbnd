# Test Plan: Story 65 — Taste Match on curator profiles

**Story:** `engineering-team/stories/done/65-taste-match-profiles.md`
**ADR:** `engineering-team/decisions/0064-taste-match-profiles.md`
**Date:** 2026-06-06

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (percentage + count when overlap clears the bar) | `identical ratings on the co-rated set → 100%` | `packages/trust/test/taste-match.test.ts` | unit |
| AC-1 | `returns the percentage and the count of books in common for a signed-in viewer` | `apps/api/test/routes/profile-taste-match.test.ts` | route |
| AC-1 | `above the threshold → shows the percentage and the count of books in common` | `apps/web/test/components/taste-match-chip.test.tsx` | component |
| AC-2 (score reflects agreement) | `closer agreement scores higher than looser agreement`, `off by one → 75%`, `maximally opposite → 0%`, `rounds to nearest whole percent` | `packages/trust/test/taste-match.test.ts` | unit |
| AC-3 (honest below threshold) | `below the minimum overlap → thresholdMet false and NO percentage` | `packages/trust/test/taste-match.test.ts` | unit |
| AC-3 | `fewer than the minimum co-rated books → thresholdMet false, no percentage` | `apps/api/test/routes/profile-taste-match.test.ts` | route |
| AC-3 | `below the threshold → honest 'Not enough overlap yet', no percentage` | `apps/web/test/components/taste-match-chip.test.tsx` | component |
| AC-4 (hidden when signed out) | `signed out → { signedIn: false } and no rating reads` | `apps/api/test/routes/profile-taste-match.test.ts` | route |
| AC-4 | `signed out → renders nothing and never queries taste match` | `apps/web/test/components/taste-match-chip.test.tsx` | component |
| AC-5 (reflects overlap as it grows) | `4 co-rated is below the bar; a 5th co-rated book crosses it` | `apps/api/test/routes/profile-taste-match.test.ts` | route |
| AC-5 | `exactly at the minimum overlap → thresholdMet true (boundary)` | `packages/trust/test/taste-match.test.ts` | unit |

## Edge cases

- [x] Only co-rated books count; books rated by only one user are ignored (`ignores books only one of the two has rated`, unit).
- [x] Zero overlap → commonBooks 0, not met, no percentage (unit).
- [x] Viewing your own profile → `self` (route + component).
- [x] Configurable minimum overlap honored (`honors a configurable minimum`, unit; `honors a configurable TASTE_MATCH_MIN_OVERLAP`, route).
- [x] Observer is the session user — both the viewer's and the target's ratings are read author-scoped (route).
- [x] Best-effort: a rating-read failure degrades to an honest empty match (200), never a 500 (route).
- [x] Rounding pinned (mean distance 1.5 → 62.5 → 63) so the percentage is deterministic (unit).

## Test infrastructure

- Runner: Vitest (workspace default). Unit in `packages/trust/test/`, route in `apps/api/test/routes/` (express + supertest + injected deps, mirroring `foryou.test.ts`), component in `apps/web/test/components/` (Testing Library, `vi.mock` of `useSession` + `../../src/lib/api`, mirroring `follow-button.test.tsx`).
- Fixtures: signed kind-39999 rating events via `apps/api/test/ratings/_fixtures.ts` (`signedRating({ sk, bookSlug, score })`), fixed secret keys so the viewer's and the target's ratings share stable pubkeys.
- No live relay, no real crypto in the component test, no network. Pure metric and route reads are fully deterministic.

## How to run

```
pnpm --filter @unbnd/trust exec vitest run test/taste-match.test.ts
pnpm --filter @unbnd/api   exec vitest run test/routes/profile-taste-match.test.ts
pnpm --filter @unbnd/web   exec vitest run test/components/taste-match-chip.test.tsx
pnpm -r test        # full gate
pnpm -r typecheck   # must stay clean even with the red set
```

## Verification

The new tests fail with the current (stub) code, for the right reason (assertions/behavior, not import errors), and the workspace typechecks clean. Confirmed 2026-06-06 at commit `fec54d8` (pre-implementation):

```
packages/trust  test/taste-match.test.ts                 10 failed (10)   — computeTasteMatch throws (stub)
apps/api        test/routes/profile-taste-match.test.ts   8 failed (8)    — route returns 501 (stub)
apps/web        test/components/taste-match-chip.test.tsx  4 failed (4)    — chip is a stub span

pnpm -r typecheck → EXIT 0 (12 packages, no errors)
```

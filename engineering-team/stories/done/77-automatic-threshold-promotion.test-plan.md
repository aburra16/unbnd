# Test Plan: Story 77 — Automatic threshold promotion

**Story:** `engineering-team/stories/77-automatic-threshold-promotion.md`
**ADR:** `engineering-team/decisions/0075-automatic-threshold-promotion.md`
**Date:** 2026-06-07

## Coverage map
The deliverable's logic is the pure `evaluateAutoPromotions` pass; it gets the unit tests. The wiring (a 4th maintenance sweep) and the publish path (promoter worker) are reused/unchanged — exercised by the existing maintenance + promoter tests, not re-tested here.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (crossing the threshold auto-promotes — no manual action) | `enqueues a submission with enough above-gate curators and a positive average` | `apps/api/test/submissions/auto-promote.test.ts` | unit |
| AC-2 (same canonical record / no new surface) | structural — the pass calls the existing `enqueuePromotion`; the promoter worker (unchanged) publishes the same kind-39999 record. No code path produces a different artifact. | — | — |
| AC-3 (configurable threshold) | `does not enqueue below the curator count` + `off switch: autoPromoteCuratorCount 0 enqueues nothing` + `does not enqueue when the trusted average is below the floor` | auto-promote.test.ts | unit |
| AC-4 (manual promote still works) | unchanged — the existing `submissions-promote` / `submissions-signals` route tests still pass (the promote route is untouched). | `apps/api/test/routes/submissions-*.test.ts` | regression |
| AC-5 (idempotent + below-gate-safe) | `skips a submission already in the promotions table` + `below-gate raters do not count toward the threshold` | auto-promote.test.ts | unit |

## Edge cases
- [x] **Count + quality floor** both required: enough above-gate curators **and** `trustedAverage ≥ autoPromoteMinAvg` (a panned book with 2 trusted 1–2★ ratings does NOT promote).
- [x] **Below-gate raters never count**: a 5★ crowd of untrusted raters can't trip promotion (only `curatorThreshold`+ weights count, via `computeSubmissionSignals`).
- [x] **Idempotent**: a submission with any existing `promotions` status (pending/promoting/done/failed) is skipped — never re-evaluated, never double-enqueued, never fights a failed manual job.
- [x] **Off switch**: `autoPromoteCuratorCount = 0` → the pass is a no-op (manual still works).
- [x] **Honest no-op** (covered structurally): no `trust` / `houseObserverPubkey` / `librarianPubkey` → `{ enqueued: [] }`.
- [x] **System actor**: auto-enqueued rows carry `requestedBy = librarianPubkey` (distinct from a human curator — a free audit signal), asserted in the enqueue call.
- **Fault isolation + bounded read** (a throw on one submission doesn't abort the pass; the submission list is a bounded read) — implementation properties; verified by code review, not a unit assertion.

## Test infrastructure
- Vitest. Pure unit: `FixtureTrustProvider` for the house-vantage weights; real `toBookRatingEvent`/`finalizeEvent` rating fixtures (the rater's signed pubkey is the author the signal reads); a `query` fake routed by filter (`#z` → submissions, `#a` → that slug's ratings); a `vi.fn` `enqueuePromotion` + `readPromotionStatuses`. No relay, no DB, no clock.
- Reuses `computeSubmissionSignals` (the same signal the enriched list uses) — no new trust math to test.

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/submissions/auto-promote.test.ts
pnpm --filter @unbnd/api test
pnpm -r typecheck
```

## Verification
The new tests fail against the stub (`evaluateAutoPromotions` returns `{ enqueued: [] }`). Confirmed 2026-06-07:

```
 ❯ apps/api  test/submissions/auto-promote.test.ts  (6 tests | 1 failed)
```

The one red driver is the enqueue-on-crossing case; the 5 negative/guard cases pass against the `[]` stub (they assert *no* enqueue) and remain correct after Implementation. `pnpm -r typecheck` clean; no regressions (api `105 passed | 2 skipped`, the additive `autoPromote*` config fields touch nothing else).

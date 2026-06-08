# Review: Story 77 — Automatic threshold promotion

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `547505c` + review nit fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suite `auto-promote` 6/6; api full `106 passed | 2 skipped`.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: a crossing submission is enqueued with no manual action (`enqueues a submission with enough above-gate curators and a positive average`).
- [x] AC-2: structural — the pass calls the existing `enqueuePromotion`; the unchanged promoter worker publishes the same kind-39999 record (no separate surface, no marker).
- [x] AC-3: configurable — `AUTO_PROMOTE_CURATOR_COUNT` (default 3, 0=off) + `AUTO_PROMOTE_MIN_AVG` (default 4.0); below-count / off-switch / below-floor tests.
- [x] AC-4: the manual promote route is untouched (its tests still pass; the inline enqueue was hoisted, behavior-identical).
- [x] AC-5: idempotent (skips any `promotions`-statused slug) + below-gate-safe (only above-`curatorThreshold` raters count; a 5★ untrusted crowd can't trip it).

## ADR adherence (0075)
- [x] Evaluation lives in the api (has the trust seam); the promoter worker is unchanged (still the dumb executor). The pass reuses `computeSubmissionSignals` + `readPromotionStatuses` + `enqueuePromotion`.
- [x] Threshold = count **AND** quality floor (a panned book doesn't promote) — both tested.
- [x] Wired as a 4th fault-isolated `autoPromote` maintenance sweep at `maintenanceIntervalMs`; `requestedBy = librarian` (system actor); honest no-op when off/unconfigured.
- [x] The librarian secret is **not** on the api process — auto-promote only writes a `promotions` row; the promoter (which holds the key) publishes. The egress posture is unchanged.

## DList integrity
- [x] Reads `book-submissions` (slug) + per-submission `book-ratings` (`#a`); writes nothing directly (the enqueue is a DB row; the promoter publishes the canonical record). Librarian pubkey resolved at runtime via config. Bounded reads (no unbounded scan).

## Things tests can't catch
- [x] No secrets/logging issues; the sweep logs only counts. No commented-out code. (Reworded one comment em dash.)
- [x] Fault isolation: a throw on one submission's ratings read is caught (the pass continues); the whole sweep is also `runSweep`-isolated and returns 0 on failure.
- [x] Shared `enqueuePromotion` hoist is behavior-identical (same insert + 23505→`already`); dedupes the manual route and the sweep.

## House rules check
- [x] PRD scope: just automation of the existing promote; no new catalog surface, no demotion (that's #80). POV-first (house vantage). No new dependency, no new tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **Pre-existing: `failed` promotions are never retried.** `apps/promoter/src/queue.ts` `claimPending` only claims `status = 'pending'`; a job marked `failed` is not re-claimed (despite the "retriable" comment), manual re-enqueue hits the UNIQUE(slug) constraint (`already`), and auto-promote skips any-status. So a transiently-failed promotion stays stuck until the row is cleared. **#77 inherits this, does not worsen it** (the manual path already had it), and skipping `failed` is the correct conservative choice for an automatic pass. *Recommendation: a separate promoter-retry policy (reset stale `failed` → `pending` with an attempt cap) or an ops cleanup of failed rows — carry-forward, not this story.*
2. **Sequential per-candidate ratings reads.** The pass reads each candidate's ratings in a `for…await` loop. Fine for a 1-hour background sweep at current submission volume; if submissions grow, batch or parallelize. Non-blocking.
3. **Bounded submission read (limit 200).** Documented in the ADR; submissions beyond the bound aren't evaluated in a tick. Fine at current volume; page if it grows.

## Verdict
**PASS** — all gates green, all 5 ACs covered (AC-2/AC-4 structurally, AC-1/3/5 by test), ADR 0075 + house rules adhered to, the threshold (count + floor) and below-gate safety are locked by tests, and the librarian-secret egress posture is unchanged. The non-blocking items are a pre-existing promoter-retry gap (carry-forward) and two scale notes. **Ops:** set `AUTO_PROMOTE_CURATOR_COUNT > 0` on staging once calibrated (it's dormant at the default until enabled), with the promoter cron running.

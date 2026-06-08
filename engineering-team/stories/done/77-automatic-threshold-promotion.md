# Story 77: Automatic threshold promotion

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
A reader-submitted book becomes part of the catalog through *promotion*. Today that is **manual**: a curator (a signed-in user whose house-observer GrapeRank weight ≥ `curatorThreshold`) calls `POST /api/submissions/:slug/promote`, which enqueues a row in the `promotions` table; the off-path cron `apps/promoter` worker then claims it, builds a canonical kind-39999 book record under the `books` concept, signs it with the librarian key, and publishes it (after which the book is indistinguishable from a seeded one in browse / search / shelves). Phase 3 §5.7 calls for **automating** this: a submission that the trusted graph has endorsed past a threshold should promote on its own, without a curator having to click promote.

The pieces already exist. `apps/api/src/submissions/signals.ts` `computeSubmissionSignals` already derives, from the house observer's vantage, a submission's `curatorRatingCount` (distinct raters at/above `curatorThreshold`) and `trustedAverage`. The `promotions` table + the promoter worker already do the enqueue → publish → done lifecycle, idempotently (UNIQUE slug). So automatic promotion is a **new enqueue source** — a periodic evaluation that scans submissions, computes their trust signals, and enqueues the ones that have crossed the threshold — reusing the existing promote path end to end. No new publish logic, no new catalog surface.

This serves the Founding Curator (journey 4.1 step 4): the loop runs itself once the community has spoken, instead of waiting on a manual gate.

Anchor: `product-team/prd/social-loop.md` §5.7. Builds on the manual promotion (Phase 2) + the promoter worker.

## User-facing description
As a Founding Curator, I want a submission that enough of the trusted network has endorsed to promote into the catalog automatically, so that good books arrive without anyone having to click "promote" — while I can still promote manually when I want to.

## Acceptance criteria
Testable from the outside.

- [ ] A submission whose trust signal crosses the configured threshold (enough distinct trusted curators, from the house vantage) is promoted into the catalog without any manual action.
- [ ] An auto-promoted book appears in browse, search, and shelves alongside seeded entries (it is the same canonical kind-39999 catalog record the manual path produces — no separate surface, no "promoted" marker).
- [ ] The promotion threshold is configurable.
- [ ] The manual promote (`POST /api/submissions/:slug/promote`) still works as a fallback (a curator can promote before the threshold is reached).
- [ ] Auto-promotion is idempotent and below-gate-safe: a submission already promoted (or in flight) is never enqueued twice, and only raters at/above the curator gate count toward the threshold (a crowd of untrusted ratings cannot trip it).

## DList shapes touched
- Reads `kind:39999` `book-submissions` (the candidate submissions) and the `book-ratings` for each (the trust signal source). Read-only on the relay.
- Writes the canonical `kind:39999` book record under the `books` concept — via the **existing** promoter path (the librarian-signed publish), not a new shape.
- The `promotions` Postgres table gains auto-sourced rows alongside manual ones (no schema change; the existing pending → promoting → done lifecycle).

## Out of scope
- Demotion / un-promote (story #80).
- Any change to the promoter worker's build/publish/index logic, or to how promoted books are queried (already inclusive).
- The in-product accusatory reveal (#78), rating removal (#79), contested-tag (#81).
- Notifying the submitter or curators that a book auto-promoted.

## Open questions
For the Architect (Phase 2):
1. **Where the auto-evaluation runs.** The trust-signal computation (`computeSubmissionSignals`) lives in `apps/api` (it needs the trust seam + relay reads). The Architect decides where the periodic scan-and-enqueue lives — a new pass in the api's maintenance loop, a dedicated cron, or extending the promoter worker (which would need the trust seam) — reusing `computeSubmissionSignals` + the existing idempotent enqueue, so the promoter worker stays the dumb executor.
2. **The threshold knob.** AC-3 says configurable. The Architect picks the exact gate: a count of distinct at-/above-`curatorThreshold` raters (e.g. an `AUTO_PROMOTE_CURATOR_COUNT`, default conservative), reusing `curatorThreshold` as the per-curator floor (and/or relating it to `curatorVouchMinAsserters`). Confirm one clear, documented threshold.
3. **Scan scope + cost.** How the evaluation reads the submission set within the relay-cap discipline (paged), and skips submissions already in the `promotions` table (any status) so it neither re-evaluates nor double-enqueues.

## Linked artifacts
- ADR: `engineering-team/decisions/0075-automatic-threshold-promotion.md` (Accepted)
- Test plan: `engineering-team/stories/77-automatic-threshold-promotion.test-plan.md`
- Review: `engineering-team/reviews/77-automatic-threshold-promotion.md` (PASS)

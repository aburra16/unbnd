# ADR 0075: Automatic threshold promotion — a maintenance-loop enqueue pass

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/77-automatic-threshold-promotion.md`

## Context
Manual promotion already works end to end: a curator (house-observer weight ≥ `curatorThreshold`) calls `POST /api/submissions/:slug/promote` → `enqueuePromotion(slug, requestedBy)` inserts a `pending` row in the `promotions` table → the cron `apps/promoter` worker claims it, builds a canonical kind-39999 book record under the `books` concept, librarian-signs it, publishes (local + dcosl), and marks `done`. Promoted books are then **indistinguishable** from seeded ones in browse/search/shelves (it's the same record), and the worker reindexes on write.

Two reusable pieces already exist in `apps/api`:
- `submissions/signals.ts` `computeSubmissionSignals({ trust, houseObserverHex, threshold, ratingEvents })` → `{ curatorRatingCount, trustedAverage, … }` — distinct raters **at/above** `curatorThreshold` from the house vantage, plus the trust-weighted average. The `GET /api/submissions` enriched list already runs exactly this scan per row (list submissions `#z` concept → per-submission ratings `#a` → signals).
- `db`: `readPromotionStatuses(slugs) → Map<slug, status>` and the idempotent `enqueuePromotion(slug, requestedBy)` (UNIQUE slug).

The **promoter worker has no trust seam** (relay + db + librarian key only) — pushing the trust-signal evaluation into it would mean a cross-app import of `computeSubmissionSignals` or duplicating the trust wiring. The api already holds `trust`, `computeSubmissionSignals`, `enqueuePromotion`, `readPromotionStatuses`, and a periodic `startMaintenanceSweeper` (`maintenanceIntervalMs`, default 1h, fault-isolated sweeps). So the evaluation belongs in the api; the promoter worker stays the dumb executor.

Constraints: relay-cap discipline; POV-first (house vantage); idempotent + below-gate-safe; no new catalog surface; manual promote preserved.

## Decision
A periodic **auto-promote evaluation pass** in the api that enqueues threshold-crossing submissions into the existing `promotions` table; the promoter worker is unchanged.

### The threshold: a curator COUNT **and** a quality FLOOR
"Crosses the trust threshold" = both, so a book panned by trusted curators never auto-promotes:
- `curatorRatingCount >= autoPromoteCuratorCount` — enough **distinct above-`curatorThreshold`** curators rated it (engagement; below-gate ratings never count — AC-5), and
- `trustedAverage !== null && trustedAverage >= autoPromoteMinAvg` — the trust-weighted average is positive.

Config (both configurable — AC-3):
- `autoPromoteCuratorCount` (env `AUTO_PROMOTE_CURATOR_COUNT`, positive int, default **3**). **`0` disables auto-promotion** (the off switch for staging calibration; manual still works).
- `autoPromoteMinAvg` (env `AUTO_PROMOTE_MIN_AVG`, [1,5], default **4.0**, matching `FORYOU_MIN_AVG`'s positive-signal floor).
Both reuse `curatorThreshold` as the per-curator gate (via `computeSubmissionSignals`).

### The pass (pure, injected, unit-testable)
New `apps/api/src/submissions/auto-promote.ts`:
`evaluateAutoPromotions(deps): Promise<{ enqueued: string[] }>` where deps inject `query`, `trust`, `config`, `readPromotionStatuses`, `enqueuePromotion`, and `now`. Logic:
1. Off switch: `autoPromoteCuratorCount <= 0` or no `trust`/`houseObserverPubkey`/`librarianPubkey` → return `{ enqueued: [] }` (no-op, honest).
2. List submissions (`kinds:[39999]`, `#z` `book-submissions` concept, bounded `limit` — submission volume is low; the same posture as the list endpoint, page-able later).
3. **Batch** `readPromotionStatuses(slugs)`; **skip** any slug with *any* status (pending/promoting/done/failed) — never re-evaluate or double-enqueue, and never fight a failed manual job.
4. For each remaining submission (fault-isolated — a throw on one doesn't abort the pass): read its ratings (`#a`), `computeSubmissionSignals`; if both threshold conditions hold → `enqueuePromotion(slug, librarianPubkey)`.
5. Return the enqueued slugs (for the sweep log).

`requestedBy = librarianPubkey` marks the row as a **system** (auto) promotion — distinct from a human curator's pubkey, a free audit signal in the `promotions` table.

### Wiring: a 4th maintenance sweep
Add an `autoPromote` sweep to `MaintenanceSweeps` (`apps/api/src/maintenance.ts`) — fault-isolated like keys/sessions/challenges, returning the enqueued count for the log. `index.ts` binds it to `evaluateAutoPromotions({...})`. It ticks at `maintenanceIntervalMs` (1h default) — promotion within an hour of crossing the threshold is the right cadence; no new timer.

## Consequences
- **Enables:** the loop runs itself — community-endorsed submissions promote without a click, reusing the whole publish path; auto-promoted books are the same canonical record (AC-2, structural).
- **Manual promote unchanged** (AC-4); promoter worker unchanged.
- **Safety:** the count+floor gate + below-gate filtering means a crowd of untrusted or negative ratings can't trip promotion (AC-5); the off switch (`COUNT=0`) lets staging calibrate before enabling.
- **Constrains:** the bounded submission list read caps how many submissions are evaluated per tick (fine at current volume; flagged for paging if submissions grow).
- **Affects existing fixtures?** No. New config (additive, defaulted) + a new pure module + a new sweep. The `GET /api/submissions` enriched scan is the reused pattern, untouched.
- **New dependency?** No.
- **PRD change?** No. Implements §5.7.
- **Ops note:** to enable on staging, set `AUTO_PROMOTE_CURATOR_COUNT` (>0) once the threshold is calibrated; default 3 is conservative. Record in the book's Deploy/ops notes.

## Implementation notes
- `apps/api/src/config.ts`: add `autoPromoteCuratorCount` (`AUTO_PROMOTE_CURATOR_COUNT`, default 3, int ≥0) + `autoPromoteMinAvg` (`AUTO_PROMOTE_MIN_AVG`, default 4.0, [1,5]).
- `apps/api/src/submissions/auto-promote.ts` (new): `evaluateAutoPromotions(deps)` — the pure pass above; reuses `computeSubmissionSignals`.
- `apps/api/src/maintenance.ts`: add `autoPromote: () => Promise<number>` to `MaintenanceSweeps`; run it fault-isolated each tick.
- `apps/api/src/index.ts`: bind the sweep to `evaluateAutoPromotions` with the in-scope `query`/`trust`/`config`/`readPromotionStatuses`/`enqueuePromotion`.
- No change to `apps/promoter`, the promote route, or the catalog read paths.

## Out of scope
- Demotion (#80); promoter build/publish/index changes; submitter/curator notifications; per-submission paging beyond the bounded read (flagged).

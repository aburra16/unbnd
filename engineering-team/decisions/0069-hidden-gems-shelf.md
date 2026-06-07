# ADR 0069: Hidden Gems homepage shelf

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/71-hidden-gems-shelf.md`

## Context

Story #71 adds a Hidden Gems homepage shelf: books with the highest positive hype-gap (trusted average above the crowd's raw average). The shelves infra (Story 35 / ADR 0036) is: an off-path `apps/shelves` worker `computeShelves` (house-PoV only — `houseObserverPubkey`) that writes a per-observer cache; `GET /api/homepage/shelves` serves from cache and hydrates slugs; `Home.tsx` renders. The worker already has, per book, the deduped ratings + the house weights + `weightedRatings(...).average` (trusted) and can compute the raw mean — so a hype-gap ranking is a near-free addition to `computeShelves`. The "Yours" homepage surface today is the **read-time** For-You shelf (`/api/foryou`, ADR 0037), not a scheduled per-user cache.

**The scope fork (AC-2 "House and Yours"):** the scheduled worker computes only the house PoV. A scheduled per-user Hidden Gems would mean per-user cache rows (does not scale, not how the infra works). The For-You precedent shows the "Yours" surface is computed **read-time** per request. So House Hidden Gems = scheduled (AC-4); Yours Hidden Gems = read-time (like For-You).

## Options considered

### Option A — House scheduled shelf now; Yours read-time as a thin follow-up (chosen)
Add `hiddenGems` to the worker's `ShelfSet` + the cache + the serve route + `Home.tsx`. This delivers AC-1 (hype-gap ranking), AC-3 (on-ramp empty state), AC-4 (scheduled), and the **House** half of AC-2. The **Yours** per-user Hidden Gems (read-time, mirroring `/api/foryou`, ranked by hype-gap) is a small, well-isolated follow-up (#71b) once the house shelf and the shared ranking land.
- **Pros:** lands the high-value house shelf in the existing infra with near-zero new machinery; keeps the read-time Yours variant a clean, separate concern (the For-You pattern is proven); avoids conflating scheduled-cache and read-time code.
- **Cons:** AC-2's Yours view is a follow-up, not in this story. Surfaced to the PO below.

### Option B — Both House (scheduled) and Yours (read-time) in this story
Adds the worker shelf AND a `GET /api/hidden-gems` read-time endpoint + dual homepage rendering now.
- **Cons:** larger; two surfaces (cache + read-time) in one cycle. Viable if the PO wants AC-2 fully closed in #71.

### Option C — Recompute per-request for everyone (no cache)
- **Cons:** violates AC-4 (scheduled) and re-reads all ratings per homepage load. Rejected.

## Decision

**Option A**, with the AC-2-Yours scope decision surfaced to the PO. Hidden Gems is a house-PoV scheduled shelf computed in `computeShelves`, gated by the trusted-rater minimum and a positive-gap margin, ranked by `trustedAverage − rawAverage` descending. The thresholds reuse #70's idea server-side as worker `ShelfDefs` (`hiddenGemsMargin` default 0.5; the trusted-rater minimum reuses `favoritesMinRatings`). The Yours read-time variant is recommended as fast-follow #71b.

## Consequences
- Reuses the worker's existing per-book deduped ratings + house weights + `weightedRatings` (no new trust/ranking math, no new relay read).
- **New DList shape?** No. **New dependency?** No.
- **New config:** worker `HIDDEN_GEMS_MARGIN` (`ShelfDefs.hiddenGemsMargin`, default 0.5); the min reuses `favoritesMinRatings`.
- **Cache shape:** `ShelfSet` and `CachedShelfSet` gain `hiddenGems: string[]` (additive; old cache rows without it read as empty until the next worker cycle).
- **Affects fixtures?** The homepage visual fixture is honest-empty (no trusted signal) → Hidden Gems empty → its on-ramp shows; a deliberate baseline update may be needed (ADR 0039 labeled-baseline process) if the empty shelf renders in the signed-out fixture. Flag at impl.

## Implementation notes
- **`apps/shelves/src/compute.ts`** — add `hiddenGems: ShelfRow[]` to `ShelfSet`; compute it in `computeShelves`: for each book with `weightedRatings` and `trustedCount ≥ favoritesMinRatings`, `gap = weighted.average − rawMean(deduped)`; keep `gap ≥ defs.hiddenGemsMargin`; sort by gap desc (slug tie-break); take `booksPerRow`.
- **`apps/shelves/src/config.ts`** — add `hiddenGemsMargin` to `ShelfDefs` (env `HIDDEN_GEMS_MARGIN`, default 0.5).
- **`apps/shelves/src/cache.ts`** + the DB row shape — persist `hiddenGems` in the atomic replace (additive JSON field).
- **`apps/api/src/routes/homepage-shelves.ts`** — add `hiddenGems: string[]` to `CachedShelfSet`; collect its slugs into the batch hydrate; return `hiddenGems: { books: hydrate(set.hiddenGems) }`.
- **`apps/web`** — `Home.tsx` renders a Hidden Gems shelf row from the serve response; the on-ramp empty state ("As people you trust rate more books, the ones they love that the crowd missed show up here. Follow a few curators to start.") when its `books` is empty. Reuse the existing shelf-row component.

## Out of scope
- The Yours read-time Hidden Gems (#71b, recommended fast-follow).
- The book-detail hype-gap indicator (#70, shipped).
- Any change to the trust-weighted average computation or the other shelves.

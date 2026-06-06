# ADR 0064: Taste Match on profiles — read-time pairwise rating agreement

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/done/65-taste-match-profiles.md`

## Context

Story #65 asks for an observer-relative taste-match percentage on a public profile: "how often you and this person agreed on books you've both rated," with an honest "Not enough overlap yet" below a configurable minimum, hidden when signed out (PRD §5.1, §6, §7). The honesty invariant (PRD §7) means no number shows unless real overlap exists. v1 is **raw rating agreement** (PO-approved); the trust-weighted variant is a later story.

Established patterns to reuse (no new DList shape): ratings are replaceable kind-39999 events under the `book-ratings` concept, one current event per (rater, book), score 1–5. Author-scoped reads already exist in `apps/api/src/routes/profile-stats.ts` (`statsFor` → `queryPaged({ kinds:[39999], "#z":[ratingsConcept()], authors:[hex] })`). The observer is resolved from the session cookie via `deps.sessionUser` (`apps/api/src/auth/sessions.ts`). Pure rating logic lives in `packages/trust/src/ratings.ts`. For-You (`apps/api/src/routes/foryou.ts`) is the precedent for observer-relative, never-cached, read-time computation.

No new DList shape is introduced, so the Tapestry-branch crib (concept-graph / feat/communities / feat/pubkey-tagging-target) does not apply here; this is a read-only computation over the existing `book-ratings` concept plus the existing `@unbnd/trust` rating-parse helpers.

## Options considered

### Option A — New endpoint, read-time pure metric in `@unbnd/trust` (chosen)
A new `GET /api/profile/:id/taste-match` resolves the session user (observer) and the target, reads both authors' ratings, and computes a pure agreement metric. No cache (mirrors For-You). The metric is **inverse mean rating-distance**: over the co-rated set, `agreement = 1 − mean(|scoreObserver − scoreTarget|) / 4`, scaled to 0–100. Defined for any overlap ≥ 1, intuitive, robust. Minimum overlap is a config knob (`TASTE_MATCH_MIN_OVERLAP`, default 5).
- **Pros:** clean separation from the observer-agnostic, cached `/stats`; the pure metric is unit-testable and reused by Story #66 (bylines/sort); honors POV-first and filter-at-view-time (computed per observer, never stored).
- **Cons:** two author-scoped relay reads per profile view (acceptable, same shape as `/stats`).

### Option B — Extend `/api/profile/:npub/stats`
Add a `tasteMatch` field to the existing stats endpoint.
- **Cons:** `/stats` is observer-agnostic and cached 60s per target. Taste match is per-viewer, so it would poison that cache or force it off. Rejected for architectural friction.

### Option C — Pearson correlation as the metric
- **Cons:** undefined when a user's co-rated scores have zero variance (rates everything 5), unstable at small overlap, harder to explain. Rejected for v1; correlation can be revisited with the trust-weighted variant.

## Decision

**Option A.** Pure metric `computeTasteMatch(observerScores, targetScores, minOverlap)` in a new `packages/trust/src/taste-match.ts`, returning `{ commonBooks, thresholdMet, percentage? }`. A new `apps/api/src/routes/profile-taste-match.ts` wires it to `GET /api/profile/:id/taste-match`, observer = the session user. v1 is raw pairwise agreement, independent of the House/Yours toggle (the toggle governs trust weighting, which the deferred variant handles); this matches the domain model's `trustWeighted: false` for v1.

## Consequences
- What this enables: Story #66 (reuse the same pure metric for book-detail bylines and taste-sorted raters).
- What this constrains: v1 ignores trust weighting and the PoV toggle (raw pairwise). Documented; the trust-weighted variant is a named later story.
- **Affects existing fixtures?** No. The visual-regression profile fixture is signed-out, so no chip renders and no baseline changes.
- **New dependency?** No.
- **New DList shape?** No (read-only over existing `book-ratings`).
- **New config:** `TASTE_MATCH_MIN_OVERLAP` (default 5), added to config + `.env.example`.
- **PRD section change required?** No (resolves PRD open question 1 as a configurable minimum).

## Implementation notes
- **`packages/trust/src/taste-match.ts`** (new): `computeTasteMatch(a: Map<string,number>, b: Map<string,number>, minOverlap: number)` → intersect keys (book addresses); if `commonBooks < minOverlap` return `{ commonBooks, thresholdMet:false }`; else `percentage = Math.round((1 − mean(|a−b|)/4) * 100)`, return `{ commonBooks, thresholdMet:true, percentage }`. Export from `packages/trust/src/index.ts`. Pure, no I/O.
- **`apps/api/src/routes/profile-taste-match.ts`** (new): `GET /api/profile/:id/taste-match`. Resolve `viewer = await deps.sessionUser(readSessionCookie(req))`; if none → `{ signedIn:false }`. Resolve target hex (reuse the npub/hex resolution in `routes/profile.ts`). If `viewer.pubkeyHex === targetHex` → `{ self:true }`. Read both authors' ratings via the `statsFor`-style `queryPaged({ kinds:[39999], "#z":[ratingsConcept()], authors:[hex] })`; build `Map<bookAddress(#a), score>` (parse score via the existing ratings parse; book address from the `a` tag). Call `computeTasteMatch`. Return `{ signedIn:true, commonBooks, thresholdMet, percentage? }`. No cache. Best-effort: a read failure degrades to `{ signedIn:true, commonBooks:0, thresholdMet:false }`, never throws.
- **`apps/api/src/index.ts`**: register the route; thread `TASTE_MATCH_MIN_OVERLAP` from config.
- **`apps/web/src/lib/api.ts`**: add `api.profile.tasteMatch(targetNpub)`.
- **`apps/web/src/components/TasteMatchChip.tsx`** (new) + **`Profile.tsx`**: render in the `.me-id` header, only when signed-in and viewing another user. Above threshold: `@unbnd/ui` `Pill` (neutral, not amber), label `"{percentage}% match · {n} books in common"`. Below threshold: muted "Not enough overlap yet." Loading: skeleton pill. `ProfileMe.tsx` does not call it.

## Out of scope
- Caching (read-time for v1; revisit only if profile loads show measurable cost).
- The trust-weighted taste-match variant and any House/Yours dependence (later story).
- Book-detail bylines and taste-sorted raters (Story #66).

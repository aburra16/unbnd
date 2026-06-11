# Story 28b: Un-rate — remove your rating (kind-5 deletion / tombstone)

**Status:** Superseded by Story 79 (`engineering-team/stories/done/79-rating-removal.md`)
**Created:** 2026-06-01
**Type:** Feature
**Depends on:** Story 28 (`engineering-team/stories/done/28-your-rating-surface-edit.md`) — the "Your rating" surface + in-place edit + the `useBookRatings` owner + `applyWrite` reconcile.

> **Origin: gate decision (2026-06-01).** Carved out of Story 28. Story 28 ships surface + in-place edit (update). 28b adds the **destructive** path: removing a rating entirely. Split because removal needs deletion semantics (kind-5 / tombstone) that Story 28's replace-in-place model does not.

## Background

After Story 28, a signed-in user sees their own rating (filled stars, "You rated this on \<date\>") and can **update** it in place (the addressable d-tag replaces). There is no way to **remove** a rating — to go from "rated" back to "not rated." Updating is non-destructive (a new score replaces the old); removal is destructive (the rating should disappear from the book's aggregate and from the user's "Your rating" zone, reverting to the empty "Rate this book" state).

A rating is a kind-39999 addressable event keyed by `(book, rater)` via `buildBookRatingDTag` (`packages/schemas/src/BookRating.ts`). Addressable-replaceable events are not removed by publishing an "empty" replacement — they are removed by a **NIP-09 kind-5 deletion** referencing the event (by `e`/`a` tag), which well-behaved relays honor by dropping the target. This is the protocol mechanism un-rate must use; it is a different write shape from the rating publish/replace path Story 28 reuses.

## User-facing description

As a signed-in **Reader**, when I've rated a book, I want a clear way to remove my rating entirely — not just change the number — so a book I no longer want on my record returns to an un-rated state for me, and my rating stops counting toward the book's consensus. Because this is destructive, I expect a brief confirmation before it happens (unlike the routine in-place edit, which is calm and immediate).

## Acceptance criteria (to be finalized at this story's planning gate)

- [ ] **AC-1 — Remove affordance in the "Your rating" zone.** Given a signed-in user who has rated a book, the "Your rating" zone (Story 28) offers a quiet "Remove" affordance. Not present when the user has not rated.
- [ ] **AC-2 — Confirmation before the destructive act.** Unlike the in-place edit (calm, no modal), removal prompts a brief confirmation ("Remove your rating of this book?") before it executes. (This is the one place the "reserve confirmation for destructive actions" UX rule applies.)
- [ ] **AC-3 — kind-5 deletion via the existing tier write paths.** On confirm, the client publishes a NIP-09 kind-5 deletion referencing the user's rating event (by `a`/`e`), signed via the EXISTING tier paths (sovereign NIP-07; custodial server-sign via the ephemeral wrap) — no new crypto. After it lands, the book's aggregate no longer counts the user's rating and the "Your rating" zone reverts to the empty "Rate this book" state.
- [ ] **AC-4 — Optimistic + reconcile + rollback (mirrors Story 28).** Optimistic revert to the empty state; reconcile via `useBookRatings`/`applyWrite`; rollback + honest in-place error on failure; custodial `reauth_required` → honest "sign in again" + rollback.
- [ ] **AC-5 — Aggregation honors the deletion.** The read/aggregate side drops a rating whose deletion the user published (the indexer/summary must respect kind-5 tombstones for kind-39999 ratings) — verify the removed rating no longer appears in `raw` or `weighted` once the deletion is processed.
- [ ] **AC-6 — Sovereign + custodial; signed-out unaffected.** Both tiers; signed-out users see no Remove affordance.

## Open questions for the Architect
- Does strfry/dcosl + the local relay honor NIP-09 kind-5 for kind-39999 addressable events, and does the summary/aggregate path already drop tombstoned events or must it be taught to? (This is the load-bearing unknown — un-rate is only as good as deletion propagation.)
- The deletion-write seam: a new `api.ratings.remove` + route, or generalize the existing publish path to carry a kind-5? Reuse the `useBookRatings`/`applyWrite` reconcile from Story 28.
- Deletion is best-effort across relays (a relay may ignore kind-5); define honest UX if the deletion doesn't fully propagate.

## Scope
**In:** the Remove affordance + confirmation; the kind-5 deletion write via existing tier paths; optimistic/reconcile/rollback; the aggregate honoring the deletion; both tiers.
**Out:** changing the rating model; bulk removal; removing other users' ratings (own-only, like Story 27b's authnz); any change to the surface/edit flow shipped in Story 28.

## Linked artifacts
- Parent story: `engineering-team/stories/done/28-your-rating-surface-edit.md`
- ADR (parent): `engineering-team/decisions/0029-your-rating-surface-edit.md`
- Relevant: ADR 0005 (ratings), NIP-09 (event deletion).
- ADR / test-plan / review: (filled in as this story runs the gated flow)

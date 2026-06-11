# Story 79: Remove a rating

**Status:** Done
**Created:** 2026-06-09
**Type:** Feature
**Carries:** Phase 2 #28b (`unrate-removal`, deferred)

## Background
A reader rates a book by publishing a kind-39999 **addressable** rating event under the replaceable d-tag `rating--<bookSlug>--<rater8>` (`packages/schemas/src/BookRating.ts`), score a mandatory `1..5`. Re-rating the same book republishes under that same d-tag (replace) — that is how editing a rating already works today (`RatingControl` "Update rating"). The write is **per-tier**: a sovereign session signs the template in the browser (NIP-07), a custodial session signs server-side with its ephemeral-wrapped key (ADR 0006). There is **no key egress** on either path and **no hand-rolled crypto** (hard rule).

Today a reader can rate, re-rate (edit), but **cannot un-rate** — there is no way to take a rating back. Phase 2 deferred this as #28b. Phase 3 §5 (the social loop is honest and reversible) calls for it: a rating you can place you must be able to retract.

The read side is the delicate part. A current rating is surfaced through **five** seams, and removal has to make the rating vanish from **all** of them, consistently, from the relevant vantage:
1. The book's rating summary — raw (`summarizeRatings`/`rawFromParsed`) **and** the trust-weighted view (`weightedRatings`), both folded from `dedupeRatings` (latest-wins per rater).
2. The signed-in caller's **own** current rating — `resolveYourRating` → `yourRating` on `GET /api/books/:slug/ratings` (the trust-view-independent own read, ADR 0029).
3. The profile own-counts — `countOwnRatings` (`booksRated`, `reviews`).
4. For-You exclusion — `ownRatedSlugs` (a removed book should become recommendable again).
5. Taste-match — `scoreBySlug` / `scoresByAuthor` (a removed rating must not feed the metric).

All five parse rating events latest-wins; none has a concept of a retracted rating yet. So the core of this story is a **retraction signal** the rater can publish (reusing the existing per-tier write path) that every reader of these seams honors as "no current rating."

**Hard constraints:**
- No hand-rolled crypto; the retraction is signed through the **existing** per-tier path (sovereign NIP-07 / custodial ephemeral key — ADR 0006). No new crypto, no key egress.
- Only the rater can retract their own rating (a rating is self-signed; a retraction must be too).
- POV-first: the removal is honest from every vantage (raw, weighted, own, profile, For-You, taste-match) — no seam keeps showing a retracted rating.

## User-facing description
As a reader who has rated a book, I want to remove my rating from the book page, so that I can take back a rating I no longer stand behind — and have it disappear everywhere my rating shows (the book's average, my own rating, my profile counts), the same way placing it appeared everywhere.

## Acceptance criteria
Testable from the outside.

- [ ] A signed-in reader who currently has a rating on a book can **remove** it from the product (a remove affordance in the book-page rating control + the backing write), reusing the existing per-tier signing path — no new crypto, no key egress.
- [ ] Only the **rater** can remove their **own** rating: the removal is self-signed (sovereign) or signed by the caller's own custodial key (custodial); a request to remove some other key's rating is refused, and an anonymous caller cannot remove anything.
- [ ] After removal, the rating is **gone from every read seam**, from the relevant vantage:
  - the book's raw summary (`count`/`average` drop the rating) **and** the trust-weighted view;
  - the caller's **own** `yourRating` for that book (→ `null`, the rating control returns to the un-rated state);
  - the profile own-counts (`booksRated`, and `reviews` if it carried review text);
  - For-You no longer excludes that book (it becomes recommendable again);
  - taste-match no longer counts that rating.
- [ ] Removal is **idempotent and reversible the honest way**: removing an already-removed (or never-placed) rating is a no-op that does not error confusingly; and after a removal the reader can simply **rate again** (the normal rate path), which restores a current rating. (No separate "un-remove" verb — re-rating is the restore.)
- [ ] The removal is **auditable on the relay**: it is a real signed event (the rater's author, a timestamp), not a silent server-side drop — consistent with the append-only, self-sovereign model (every claim about your data is your own signed event).
- [ ] Editing an existing rating (re-rate / "Update rating") is **unchanged**; removal is a distinct, deliberate action (not reachable by fat-fingering the star control).

## DList shapes touched
- A **rating retraction** signal under the rating's identity `(rater, book)`. The exact wire shape is the Architect's call (Open Question 1): either (a) a NIP-09 kind-5 deletion referencing the rating's address/id, or (b) a replaceable **tombstone** republished under the same `rating--<slug>--<rater8>` d-tag carrying a "retracted" marker. Either way it is **self-signed by the rater** through the existing per-tier path and z-tagged/addressed so the five read seams can recognize it. No new rating *score* shape.
- The five read folds (`dedupeRatings` + `rawFromParsed`/`weightedRatings`, `resolveYourRating`, `countOwnRatings`, `ownRatedSlugs`, `scoreBySlug`/`scoresByAuthor`) gain a notion of "this (rater, book) has been retracted → treat as no current rating."

## Out of scope
- Removing **someone else's** rating (moderation/demotion of others' content is #80's lineage, not this — this is only your own rating).
- Demoting a promoted book (#80), contested-tag treatment (#81).
- Bulk "delete all my ratings" / account erasure (a broader data-rights flow; this is one rating at a time).
- Changing the rate / re-rate (edit) write path itself — editing stays exactly as is.
- Hard-deleting historical events from the relay beyond whatever the chosen retraction mechanism implies (we don't run a relay-side purge; the retraction is the source of truth the reads honor).

## Open questions
For the Architect (Phase 2 — the ADR):
1. **Retraction mechanism: kind-5 deletion vs replaceable tombstone.** The Phase-2 deferral note framed #28b as a "kind-5 deletion." But the Unbnd-idiomatic reversible pattern is a **replaceable-by-d-tag state** (`AccusatoryReveal` `revealed↔withdrawn`, the reversible author overlay), and our reads already fold `kind:[39999]` latest-wins — they would **not** automatically honor a kind-5 unless the relay actually drops the event (strfry kind-5 handling is not something the read path can assume). Decide: a kind-5 NIP-09 delete (relay-enforced, but read paths must still cope if the event lingers) **or** a tombstone event under the same d-tag (`["state","retracted"]`-style, latest-wins replace — robust regardless of relay deletion semantics, symmetric with re-rate-to-restore). Weigh robustness, relay-cap discipline, and consistency with the existing reversible patterns. **This is the decision the whole story hangs on.**
2. **Custodial removal + the ephemeral key.** The custodial signing path needs a live session key (ADR 0006); a post-restart/evicted session maps to `reauth_required` on rate today. Confirm the removal endpoint reuses that exact branch (sovereign posts a signed retraction; custodial posts an intent the server signs with the session key, or `401 reauth_required` if the key is gone) — no new signing seam.
3. **One read-fold seam or a shared helper.** Five folds (`dedupeRatings` and the four own-scoped folds in `summary.ts`) each parse rating events latest-wins. Decide whether the retraction recognition lives in **`dedupeRatings`** (so every consumer inherits it) plus the own-scoped folds, or a single shared "current rating per (rater, book)" helper the five reuse — minimizing the number of places that must learn what a retraction looks like (and the risk one seam forgets).
4. **The affordance.** Where in `RatingControl` the "Remove rating" action sits (it renders the prefilled editor when `hasRated`), its deliberate-action treatment (distinct from the stars / "Update rating", not fat-fingerable), the confirm/just-removed calm state, and the optimistic-write + reconcile through the existing `applyWrite` seam. Tokens only, calm-gravity copy, no slop.

## Linked artifacts
- ADR: `engineering-team/decisions/0077-rating-removal.md` (Accepted)
- Test plan: `engineering-team/stories/79-rating-removal.test-plan.md`
- Review: `engineering-team/reviews/79-rating-removal.md` (PASS)

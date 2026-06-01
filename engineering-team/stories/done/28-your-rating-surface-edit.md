# Story 28: Your rating — surface the signed-in user's own rating + in-place edit

**Status:** Done
**Created:** 2026-06-01
**Type:** Bug

> **Type justification.** This is filed as a **Bug**, not a Feature. The rating
> write path already exists and works (Stories 5a/5b, ADR 0005/0006), and the
> data model is already correct: ratings are addressable/replaceable, so a
> re-rate already _is_ an update at the protocol and aggregate layer (see
> Background). The broken behavior is that the book page never reflects the
> signed-in user's own current rating back to them, and a fresh rating does not
> visibly land. A signed-in user who has rated sees an empty widget and is
> offered "Submit rating" as if they had never rated. That is existing behavior
> being wrong on a core flow, which is a bug. Under Standard strictness a Bug
> may skip Architecture only if obvious; this one has a real read-path seam
> (read-own-rating regardless of trust view) and a tier branch, so it should go
> through Architecture. The PO recommends the full path.

## Background

A signed-in user who has already rated a book can submit another rating, but the
book page never shows them **their own current rating**, and a freshly submitted
rating does not visibly reflect on the page. This is a **client gap**, not a
data-model problem. There is no duplicate-rating bug to fix.

**The data model is already correct (replaceable ratings).**
`buildBookRatingDTag(bookSlug, raterPubkey)` (`packages/schemas/src/BookRating.ts`
lines 61–66) builds the d-tag `rating--<bookSlug>--<raterPubkey[:8]>`. Ratings are
kind-39999 in the parameterized-replaceable range, so re-publishing under the same
d-tag **replaces** the prior rating. strfry keeps only the latest per
`(author, d-tag)`, and the aggregator dedups by rater with latest `created_at`
winning (`apps/api/src/ratings/summary.ts` `dedupeRatings`, lines 57–86, and the
file header comment lines 1–4). So "re-rate" already equals "update" at the
protocol and aggregate layer. The schema comment at `BookRating.ts` lines 56–60
states this directly: "re-publishing under the same d-tag overwrites the previous
rating."

**The gap is purely in the web client.**

- `apps/web/src/components/RatingsPanel.tsx` renders the aggregate plus the
  reviews list (House⇄Yours via `useTrustView`), but never surfaces the
  signed-in user's **own** rating as filled stars at their score with a clear
  "Your rating" label. Under "Yours" it shows the trust-_weighted_ set
  (`active.weighted`), which is not the same thing as the user's own rating — and
  the user's own rating can be **absent** from the weighted set entirely (see the
  honesty rule below).
- `apps/web/src/components/RatingControl.tsx` is the writer. It always
  initializes `score = 0` and `review = ""` (lines 45–46), so it never prefills
  from the user's existing rating; its button always reads "Submit rating"
  (line 177) even for a user who has already rated; and on a successful write it
  replaces the aggregate summary (`setSummary(next)`, line 105) but never fills
  the user's own stars to the saved score or re-reads the user's own rating. So
  after writing, the page does not visibly reflect the change as _theirs_.

**The data to fix this is already returned by the existing endpoint.**
`GET /api/books/:slug/ratings` (`apps/api/src/routes/ratings.ts` lines 231–263)
returns `{ ...raw, weighted }`. The `raw` summary (`rawFromParsed`,
`summary.ts` lines 133–137) carries `ratings: PublicRating[]`, and each
`PublicRating` (`summary.ts` lines 12–18) carries the rater's **npub**, `score`,
`reviewText`, and `reviewDate`. The signed-in user's own entry is findable in
`raw.ratings` by matching their npub. The session already exposes the user's npub
(`session.user.npub`, consumed by `useTrustView`). **Critically, the user's own
rating lives in the `raw` list regardless of the trust view** — `weighted` is the
trust-filtered subset and may exclude the user's own rating, but `raw` does not.
This is the seam the Architect must protect (see Open Questions).

**PRD anchor:** phase2-prd **§2.5** (ratings/consensus — the House⇄Yours / PoV
model and the trusted-vs-community labeling shipped in Story 25) and **§2.6**
(the personalized-PoV / "Yours" surface). The PoV model is the reason the honesty
rule below matters: trust-weighting governs the _aggregate_ a user sees, but it
must never hide a user from their _own_ rating. This is a fix to already-shipped
behavior on a core flow; it touches no PRD §11.3 "Out of Scope" surface (no
payments, file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand,
social feed, reading progress, federation, email notifications). The rating model
is unchanged (it is already replaceable); no new DList shape is introduced.

This story reuses machinery that already exists, so it stays small and consistent
with the shipped rating flow (named here so the Architect inherits the seam):

- **The existing write paths.** Sovereign: `api.ratings.template` → NIP-07
  `signEvent` → `api.ratings.submit` (`RatingControl.tsx` lines 87–94). Custodial:
  `api.ratings.submitCustodial` → server signs with the session's
  ephemeral-wrapped key (ADR 0006; `apps/api/src/routes/ratings.ts` lines 126–180).
  Both publish via the same `/api/ratings` endpoint, branched by tier server-side.
  Re-publishing replaces via the existing addressable d-tag — no new write path.
- **The existing read path.** `api.ratings.list(slug, observer?)` →
  `GET /api/books/:slug/ratings`. The user's own rating is already in the returned
  `raw.ratings` list, findable by npub. The PO's read is that **no new endpoint is
  needed**; the Architect confirms whether `raw.ratings` is the correct source for
  "own rating" or whether a small dedicated field/param is cleaner (Open Question 1).
- **The trust perspective hook.** `useTrustView` (`apps/web/src/hooks/useTrustView.ts`)
  already drives House⇄Yours and exposes the signed-in npub; the "Your rating" zone
  must render the same under both views (the honesty rule).

## User-facing description

As a **Reader** (PRD §3) who is signed in and has already rated a book, I want the
book page to show me my own current rating with my stars filled to my score and a
clear "Your rating" label, and I want to change it by clicking a different star or
editing my review right there, so that I always see where I stand on a book and can
adjust it without hunting for a separate form or wondering whether my change took.

As a **Curator** who rates many books, I want the rating control to open already
set to my current score and review when I have rated, with an "Update rating" button
and a quiet note of when I last rated it, so that revising a rating feels like
editing what I already said rather than starting over.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable. "The user's
own rating" means the entry in the book's ratings whose rater matches the
signed-in user's npub. Copy in these ACs is illustrative and must pass the no-slop
rule (`memory/feedback_unbnd_copy_and_visual.md`); the final strings are the
Implementer's within that constraint. No hand-rolled crypto: both tiers reuse the
existing signing paths (NIP-07 for sovereign, server ephemeral-wrap for custodial).

- [ ] **AC-1 — Own rating is surfaced with filled stars and a "Your rating" label.**
  Given a signed-in user who has previously rated a book with score `S` (and
  optionally review `R`), when the book page loads, then a distinct "Your rating"
  zone renders their stars filled to `S` (and surfaces `R` if present), labeled
  clearly as their own rating — never an empty rating widget. The user's own score
  is sourced from the book's ratings keyed by their npub (present in the `raw` list
  regardless of trust view).

- [ ] **AC-2 — "You rated on <date>" is shown for an existing rating.**
  Given a signed-in user who has rated a book, when the "Your rating" zone renders,
  then it shows a quiet line stating the date they rated it (e.g. "You rated this
  on <date>"), sourced from the `reviewDate` of their own rating. Given a signed-in
  user who has **not** rated the book, no such line and no filled "Your rating"
  stars appear; they see the empty interactive control prompting a first rating.

- [ ] **AC-3 — Own rating shows under BOTH House and Yours (honesty rule).**
  Given a signed-in user who has rated a book, when they switch between the House
  and Yours perspectives, then their own "Your rating" (filled stars at their score,
  the date line, their review) renders **identically and is present under both
  views**. Trust-weighting may change the aggregate and the reviews list, but it
  **never** hides or alters the user's own rating shown back to them. Specifically:
  even when the user's own rating is absent from the trust-weighted (`weighted`) set,
  the "Your rating" zone still shows it (sourced from the `raw`/own read, not the
  trust-filtered set).

- [ ] **AC-4 — In-place edit: the rating control IS the editor, prefilled.**
  Given a signed-in user who has already rated, when they open/interact with the
  rating control, then it is prefilled with their existing score and review, the
  primary button reads "Update rating" (not "Submit"), and a single quiet line
  states that they already rated it and saving will update it (e.g. "You rated this
  on <date>. Saving will update it."). There is no separate "submit another rating"
  affordance and no destructive-sounding "overwrite?" warning/modal for this routine
  edit. (For a user who has not yet rated, the control reads "Submit rating" or
  equivalent first-rating copy, with no already-rated line.)

- [ ] **AC-5 — Editing republishes via the existing addressable d-tag (replace).**
  Given a signed-in user who changes their score (clicks a different star) and/or
  edits their review and saves, when the change is published, then it goes through
  the **existing** rating write path for their tier (sovereign: template → NIP-07
  sign → submit; custodial: server-sign via the session ephemeral-wrap) and is
  published under the **same** d-tag `rating--<bookSlug>--<raterPubkey[:8]>`, so it
  **replaces** the prior rating rather than creating a second one. After the write,
  the book's ratings for that user resolve to exactly one current rating at the new
  score (verified via read-back; no duplicate entry for the user).

- [ ] **AC-6 — Optimistic update then reconcile on read-back; honest rollback.**
  Given a signed-in user changes their rating, when they save, then the "Your
  rating" zone fills to the new score immediately (optimistic), the change is
  published, and the page reconciles against a read-back so the user's own rating
  and the aggregate reflect the saved state without a manual refresh (this also
  fixes the "doesn't show up" symptom). Given the publish or read-back fails, then
  the optimistic state is rolled back to the prior rating and an honest, plain-copy
  error is shown in place (no false "saved" confirmation). On success a quiet
  in-place confirmation is shown, not an alarmist warning or a celebratory toast.

- [ ] **AC-7 — Both tiers: sovereign and custodial.**
  Given a **sovereign** (NIP-07) user, when they surface and edit their own rating,
  then AC-1 through AC-6 hold using the NIP-07 sign path. Given a **custodial**
  (email) user, when they surface and edit their own rating, then AC-1 through AC-6
  hold using the server-side ephemeral-wrap signing path (ADR 0006), with no NIP-07
  extension required. Neither path introduces new crypto; both reuse the shipped
  `/api/ratings` write and the existing read.

- [ ] **AC-8 — Signed-out users see a sign-in prompt, not an own-rating zone.**
  Given a signed-out visitor, when the book page renders, then no "Your rating" zone
  and no prefilled control appear; they see the existing sign-in prompt to rate
  (current `RatingControl` signed-out behavior is preserved). The aggregate
  consensus (House view) continues to render for signed-out visitors as today.

## DList shapes touched

No new shapes, and **no change to the rating model** (it is already replaceable).
This reads existing events and republishes under the existing d-tag.

- `kind:39999` — book **rating** events under the book record address (read for the
  aggregate and to find the user's own entry by npub; re-published under the
  existing `rating--<bookSlug>--<raterPubkey[:8]>` d-tag to replace on edit).
- `kind:39998` — `book-ratings` concept header (unchanged role — the rating's `z`
  parent pointer).

## Out of scope

State explicitly — do not build:

- **REMOVING / un-rating a rating (a destructive "clear my rating" path).** This
  requires a kind-5 deletion / tombstone and is heavier protocol work than an
  in-place edit. It is **recommended for a follow-up split (Story 28b)**, mirroring
  how Story 27's AC-6 (rename) was split to Story 27b. See "Flags for the gate."
  This story covers setting and changing a rating, not deleting one. (A user can
  effectively change an unwanted rating to a different score via the edit path; what
  is out of scope is removing the rating event entirely so the book shows no rating
  from them.)
- **Any change to the rating MODEL.** Ratings stay kind-39999 addressable/replaceable
  exactly as today. No new schema, no new d-tag scheme.
- **Any change to aggregate computation or trust-weighting.** `summarizeRatings`,
  `weightedRatings`, the House⇄Yours aggregate, and the trusted/community labeling
  (Story 25 / ADR 0014, 0025) are untouched. This story adds a per-user "own rating"
  view alongside the existing aggregate; it does not re-weight or re-label the
  aggregate.
- **Ratings on anything but books.** No genre/tag/shelf "own state" surfacing here.
- **A new ratings endpoint, if `GET /api/books/:slug/ratings` already returns the
  user's own rating in its `raw.ratings` list.** PO's read: **no new endpoint
  needed** (the data is present, findable by npub, and trust-view-independent). Left
  as a seam for the Architect to confirm (Open Question 1).
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments,
file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed,
reading progress, federation, or email notifications. It is a read-time own-rating
view plus an in-place edit that reuses the shipped replaceable-rating write.

## Honesty rule (non-negotiable — call out for the ADR)

The signed-in user's **own** rating must be shown back to them under **both** the
House and the Yours perspectives, identically. Trust-weighting governs the
_aggregate_ and the _reviews list_ a user sees; it must **never** hide a user's own
rating from themselves, even when their own rating carries no trust weight from the
active observer's vantage and is therefore absent from the trust-weighted set. The
"Your rating" zone is sourced from the user's own rating (present in the `raw` list,
keyed by npub), not from the trust-filtered (`weighted`) set. The Architect must
treat this as a hard constraint on wherever "own rating" is read from: it can **not**
be sourced only from the trust-filtered set.

## Open questions

Resolve before approving the story.

1. **Does the existing endpoint suffice, or is a small read seam cleaner?**
   PO's read: **no new endpoint.** `GET /api/books/:slug/ratings` already returns
   `raw.ratings` with each rater's npub, score, reviewText, and reviewDate, so the
   client can find the user's own entry by `session.user.npub`. Confirm the Architect
   agrees, or whether a dedicated `yourRating` field on the response (or a small
   query param) is cleaner than client-side npub matching — without sourcing "own
   rating" from the trust-filtered set (honesty rule).

2. **Read-own-rating-regardless-of-trust-view seam (flagged for the Architect).**
   Today the "Yours" view fetches `api.ratings.list(slug, npub)` and the panel reads
   the `weighted` subset for that observer. The user's own rating can be absent from
   that subset. The Architect must ensure the "Your rating" zone reads from a
   trust-view-independent source (the `raw` list / own read), so switching to "Yours"
   never blanks the user's own rating. Confirm where the own-rating read is sourced.

3. **Where does the "Your rating" zone live — in `RatingsPanel`, in `RatingControl`,
   or a shared piece?** Today the aggregate display (`RatingsPanel`) and the writer
   (`RatingControl`) are separate components, both independently calling
   `api.ratings.list`. The story wants one coherent "Your rating" zone (display +
   in-place edit). The Architect picks the component boundary and how the two
   existing components are reconciled (e.g. lift the read, or have the control own
   the own-rating state). PO does not prescribe the structure.

4. **Custodial edit and the in-session signing key.** Editing republishes via the
   custodial server-sign path, which needs the session's ephemeral-wrapped key live
   (ADR 0006). If the key is gone (process restart / evicted), the existing endpoint
   returns `reauth_required` (401). Confirm the edit flow surfaces that as an honest
   "sign in again to update" prompt and rolls back the optimistic state (AC-6),
   rather than a generic error.

## Flags for the gate (PO — possibly contentious, user decides)

- **Recommended split: un-rate / remove → Story 28b.** Removing a rating entirely
  (so the book shows no rating from the user) needs a kind-5 deletion / tombstone and
  is materially heavier than the in-place edit this story delivers. PO **recommends
  splitting it to a follow-up Story 28b**, exactly as Story 27's rename AC-6 was
  carved to 27b. This story ships AC-1–8 (surface + in-place edit, both tiers, the
  honesty rule, optimistic+reconcile, update-framing); removal is deferred. Flagging
  so the user can decide whether to keep removal out or fold a minimal "clear my
  rating" into this story (which would expand it into kind-5 deletion territory).

- **AC-4 "Update rating" framing assumes the control is prefilled and editable in
  place.** This changes the shipped `RatingControl` copy and initial state (today it
  always starts empty and says "Submit rating"). It is the right behavior, but it is
  a visible change to a live flow; called out so the user can confirm the
  update-framing (prefilled control, "Update rating" button, the quiet already-rated
  line) versus keeping a more conservative "you've rated this — change it?" step.

- **No new endpoint is the PO's assumption (Open Question 1).** If the Architect finds
  the client-side npub match unacceptable and adds a `yourRating` field/param, that is
  a small API change the user should be aware of at the gate.

## Linked artifacts
- ADR: `engineering-team/decisions/0005-sovereign-rating-publish.md` (the rating
  write/read-back core and the replaceable d-tag), and the related prior ADRs this
  reuses: `0006-custodial-server-signing.md` (custodial server-sign via the
  ephemeral wrap, used by the custodial edit path), `0014-graperank-personalize.md`
  and `0025-weighted-consensus.md` (the House⇄Yours trust view and trusted/community
  labeling the honesty rule sits beside).
- New ADR for this story: `engineering-team/decisions/0029-your-rating-surface-edit.md`
- Test plan: `engineering-team/stories/done/28-your-rating-surface-edit.test-plan.md`
- Review: (filled in after Review phase)

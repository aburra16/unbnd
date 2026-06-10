# ADR 0077: Rating removal — a self-signed retraction tombstone under the same replaceable d-tag

**Status:** Accepted
**Date:** 2026-06-09
**Story:** `engineering-team/stories/79-rating-removal.md`

## Context
A rating is a kind-39999 event signed **by the rater**, published under the parameterized-replaceable d-tag `rating--<bookSlug>--<rater8>` (`packages/schemas/src/BookRating.ts`); score is a mandatory `1..5`. Kind 39999 is in the addressable (30000–39999) range, so the relay keeps only the **latest** `(pubkey, 39999, d-tag)` — the codebase already relies on this for editing ("re-publishing under the same d-tag overwrites the previous rating", `BookRating.ts:57`). The write is per-tier: sovereign signs the server-built template in the browser (NIP-07); custodial signs server-side with the session's ephemeral-wrapped key (ADR 0006). No key egress, no hand-rolled crypto.

A current rating is surfaced through **five** read folds, all latest-wins:
1. **`dedupeRatings`** (`packages/trust/src/ratings.ts`) — feeds the book's raw summary (`rawFromParsed`/`summarizeRatings`) **and** the trust-weighted view (`weightedRatings`). Keyed by **pubkey** (the route reads one book's `#a` address, so per-pubkey = per-(rater, this book)).
2. **`resolveYourRating`** (`apps/api/src/routes/ratings.ts`) → `yourRating` on `GET /api/books/:slug/ratings` (the caller's own current rating, trust-view-independent).
3. **`countOwnRatings`** (`booksRated`/`reviews`), 4. **`ownRatedSlugs`** (For-You exclusion), 5. **`scoreBySlug`** / **`scoresByAuthor`** (taste-match) — all in `apps/api/src/summary.ts`, keyed by **bookSlug** (own-scoped, one author across many books) resp. **(author, book)**.

Each fold parses events with `fromBookRatingEvent` and **skips on parse failure** (`continue`). There is no notion of a retracted rating; today a reader can rate and re-rate (edit) but not un-rate (Phase-2 #28b, deferred).

## Decision
A rating removal is a **self-signed retraction event** published under the **same** `rating--<slug>--<rater8>` d-tag; the five read folds recognize it and treat that (rater, book) as **no current rating**.

### 1. Mechanism: a replaceable tombstone, not a kind-5 delete (resolves OQ-1)
The retraction is a kind-39999 event under the rating's own d-tag carrying a retracted marker (no valid score). Because 39999 is parameterized-replaceable, publishing it **replaces the prior rating at the relay** — the old rating event is gone relay-side, exactly as an edit replaces it. This is chosen over a NIP-09 kind-5 deletion because:
- **Relay-enforced + read-robust.** The replace is the same mechanism edits already depend on; the read path does not have to assume the relay honors kind-5, nor cross-reference a separate deletion event against a `kind:[39999]` read.
- **Symmetric with restore.** Re-rating (AC-4) republishes a normal rating under the same d-tag → replaces the tombstone → the rating is present again. No "un-remove" verb; re-rate **is** the restore. A kind-5 would orphan the d-tag and complicate re-rating.
- **Consistent with the codebase's reversible patterns** (`AccusatoryReveal` `revealed↔withdrawn`, the reversible author overlay): reversal by replacing a replaceable address, never by a tombstone-plus-delete pair.

### 2. The retraction shape (`@unbnd/schemas`)
A new builder `buildBookRatingRetraction({ bookSlug, raterPubkey, parentHeader })` emitting a 39999 event with:
- `["d", "rating--<slug>--<rater8>"]` — **identical** to the rating's d-tag (same addressable identity → relay replace),
- `["z", <ratings header address>]`, `["t", slug]`, `["a", <book address>]`, `["p", raterPubkey]` — same routing as a rating, so the same `#a` read returns it,
- `["retracted", "true"]` — the marker; **no `["score", …]` tag**,
- `content: ""`, payload `wordTypes: ["word", "bookRating"]` with a `retracted: true` sentinel (no score).

A predicate **`isRatingRetraction(event)`** (the marker-tag check, in `@unbnd/schemas`, alongside the rating helpers) is the **single new primitive** the read folds share. `fromBookRatingEvent` is **unchanged** (its score-required invariant stays intact) — the folds check `isRatingRetraction` *before* parsing, so a retraction never reaches `fromBookRatingEvent`.

### 3. The five read folds learn one rule (resolves OQ-3)
Each fold already builds a latest-wins map over its key. The rule added to all five: **fold ratings AND retractions into the latest-wins map by `created_at`; if the latest event for a key is a retraction, the key has no current rating** (drop it). Concretely:
- **`dedupeRatings`**: track the latest event per pubkey including retractions; if the latest is `isRatingRetraction` → omit that pubkey. (Both the raw summary and `weightedRatings` inherit this — one change covers seams 1.)
- **`resolveYourRating`**: it already reads the deduped set (which now drops a retracted self-rating) plus the author-scoped fallback; the fallback dedupe inherits the same rule → `yourRating` becomes `null`. (Seam 2.)
- **`countOwnRatings` / `ownRatedSlugs` / `scoreBySlug`** (key = bookSlug) and **`scoresByAuthor`** (key = (author, book)): same restructure — latest event per key over the union; a retracted head excludes the book. (Seams 3–5.)

The shared piece is the **predicate**; the per-fold key functions differ (pubkey vs bookSlug vs (author,book)), so the latest-wins-then-drop-retracted logic lives in each fold over its own map — but every fold recognizes a retraction the same way. This minimizes the "one seam forgets" risk: the only thing to get right per fold is "include retractions in the created_at race, drop a retracted head."

**Why folding-in (not skipping) matters:** a retraction must *win the created_at race* against the older real rating to suppress it. If a fold merely `continue`d past a retraction (today's parse-fail behavior), the older rating would remain the map's head and keep counting — the bug this guards against. Hence retractions are explicitly admitted into each map as a "retracted" sentinel.

### 4. The endpoints (mirror the rate path; resolves OQ-2)
Symmetric with `POST /api/ratings/template` + `POST /api/ratings`:
- **`POST /api/ratings/remove/template`** — session → user; build `buildBookRatingRetraction` template for the caller + book; `{ template }`. `401` no session. (Sovereign needs a server-built template because the parent-header/book-address resolve from the librarian pubkey in config.)
- **`POST /api/ratings/remove`** — branched by tier, exactly like `POST /api/ratings`:
  - **Sovereign:** body `{ event }`; `validateSignedRetraction(event, user.pubkeyHex)` (kind 39999, `["retracted","true"]` present + **no score**, d-tag === `rating--<slug>--<rater8>` for the caller, signature valid, author === caller) → mismatch `403`, malformed `400`; then `publish`.
  - **Custodial:** body `{ bookSlug }`; build the retraction template, `custodialSign(sessionIdHex, template)`; null (key evicted/post-restart) → `401 reauth_required` (the **same** branch as rate); then `publish`.
  - **Idempotency + relay-cap discipline (AC-4):** before publishing, resolve the caller's current rating (reuse `resolveYourRating`); if there is **no current rating**, return `200 { removed: false, … }` **without publishing** a tombstone (so removing twice never spams replace-events). If there is one → publish the retraction, return `200 { removed: true, summary, yourRating: null }`.
  - On success the response carries the recomputed `summary` (now excluding the rating) and `yourRating: null`, so the client reconciles through the existing `applyWrite` seam.

`validateSignedRetraction` is a sibling of `validateSignedRating` in `apps/api/src/ratings/validate.ts` (same `verifyEvent`-on-fresh-body discipline, ADR 0004).

### 5. Web affordance (resolves OQ-4)
`RatingControl` renders the prefilled editor when `hasRated`. Add a **deliberate** "Remove rating" action there — a quiet text button **separated** from the stars and "Update rating" (not fat-fingerable, AC-6), with a small two-step confirm ("Remove your rating? You can rate again anytime.") → calls `api.ratings.remove(bookSlug)` (sovereign: fetch template → NIP-07 sign → submit; custodial: submit intent). Optimistic: on success, `applyWrite(summary, …)` with the rating cleared so the control returns to the un-rated state. Tokens only, calm-gravity copy, no slop. Non-rated / anon users never see it.

## Consequences
- **Enables:** a reader removes their own rating from the book page; it vanishes from all five read seams (raw + weighted summary, own `yourRating`, profile counts, For-You exclusion, taste-match), relay-enforced, auditable (a real signed event with the rater's author + timestamp), and reversible by simply re-rating.
- **Edit path unchanged** (AC-6): re-rate still replaces under the same d-tag; the only new write is the retraction, the only new read primitive is `isRatingRetraction`.
- **Security:** only the rater can retract (self-signed sovereign / own custodial key; `validateSignedRetraction` enforces author === caller → `403` otherwise; anon → `401`). No key egress, no new crypto — the retraction rides the existing per-tier signing path.
- **Relay-cap discipline:** the no-current-rating short-circuit means a double-remove publishes at most one tombstone; the tombstone itself *replaces* the rating (net-zero event growth per (rater, book), not additive).
- **Constrains:** every rating read fold now must admit retractions into its latest-wins race. Mitigated by the shared `isRatingRetraction` predicate and the single explicit rule; the Tester covers each seam.
- **Affects existing fixtures?** Additive. New schema builder + predicate, new endpoints, new validate sibling, a restructured (not rewritten) latest-wins in five folds. Existing tests asserting rating summaries are unaffected (no retraction in their fixtures); the retraction-aware tests are new. No `PublicRating`/`RatingsSummary` shape change.
- **New dependency?** No. **PRD change?** No — implements Phase-3 §5 (honest, reversible social loop) / carries Phase-2 #28b.

## Implementation notes
- `packages/schemas/src/BookRating.ts`: `buildBookRatingRetraction({ bookSlug, raterPubkey, parentHeader })` (same d-tag, `["retracted","true"]`, no score) + `isRatingRetraction(event)` predicate. `fromBookRatingEvent` untouched.
- `packages/trust/src/ratings.ts`: `dedupeRatings` admits retractions into the per-pubkey latest-wins race; a retracted head omits the pubkey.
- `apps/api/src/summary.ts`: `countOwnRatings`, `ownRatedSlugs`, `scoreBySlug`, `scoresByAuthor` apply the same latest-wins-then-drop-retracted rule over their keys.
- `apps/api/src/ratings/validate.ts`: `validateSignedRetraction(event, sessionPubkey)` (sibling of `validateSignedRating`).
- `apps/api/src/routes/ratings.ts`: `POST /api/ratings/remove/template` + `POST /api/ratings/remove` (tier-branched, idempotent short-circuit via `resolveYourRating`, returns `{ removed, summary, yourRating: null }`). `RatingsDeps` reuses the existing `sessionUser`/`publish`/`query`/`custodialSign`.
- `apps/web/src/lib/api.ts`: `api.ratings.remove(bookSlug)` (template → sign → submit per tier).
- `apps/web/src/components/RatingControl.tsx` (+ CSS): the separated, confirm-gated "Remove rating" action; optimistic clear via `applyWrite`; tokens-only, calm copy.

## Out of scope
- Removing others' ratings (#80 lineage); demotion (#80); contested tags (#81); bulk "delete all my ratings" / account erasure; any relay-side purge beyond the replace the tombstone already performs; changing the rate/edit write path.

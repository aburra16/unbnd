# ADR 0029: Your rating — surface the signed-in user's own rating + in-place edit

**Status:** Proposed
**Date:** 2026-06-01
**Story:** `engineering-team/stories/28-your-rating-surface-edit.md`

> **Relationship to prior ADRs.** This ADR does **not** introduce a new write path, a new
> read endpoint shape (see §1), a new DList shape, or any new crypto. It composes machinery
> already shipped by ADR 0005 (`0005-sovereign-rating-publish.md` — the rating template/submit/
> read-back core and the replaceable d-tag `rating--<bookSlug>--<raterPubkey[:8]>`), ADR 0006
> (custodial server-sign via the session ephemeral wrap), and ADRs 0014/0025 (the House⇄Yours
> trust view and trusted/community labeling). It changes only the **web client** (plus a tiny,
> optional read-path hardening on the API noted in §1) to close a client gap: the book page never
> reflects the signed-in user's own current rating back to them. It contradicts no prior ADR.
> The aggregate computation (`summarizeRatings`, `weightedRatings`, the House⇄Yours labels) and
> the rating model (kind-39999 addressable/replaceable) are untouched.

## Context

A signed-in user who has already rated a book sees an empty rating widget and an offer to
"Submit rating" as if they had never rated; a freshly submitted rating does not visibly land as
*theirs* without a manual reload. The story files this as a Bug on a core flow. The data model is
already correct (re-publishing under the same d-tag replaces), so this is purely a client read/
reconcile gap, with one read-path seam to protect (read-own-rating regardless of trust view) and a
tier branch (sovereign / custodial).

**PRD anchor:** phase2-prd §2.5 (ratings/consensus, House⇄Yours / PoV, trusted-vs-community
labeling from Story 25) and §2.6 (personalized-PoV "Yours" surface). The PoV model is exactly why
the honesty rule matters: trust-weighting governs the *aggregate* a user sees, but it must never
hide a user from their *own* rating. Touches no PRD §11.3 out-of-scope surface.

### Code this design is built against (verified against the current branch)

- **`apps/web/src/components/RatingsPanel.tsx`** — renders the aggregate + reviews with the
  House⇄Yours toggle via `useTrustView` (line 16). It fetches the *house* summary with
  `api.ratings.list(slug)` (line 22) and, only when the user switches to "Yours", a second
  `api.ratings.list(slug, npub)` (line 31). The active view's `weighted` subset drives the displayed
  average/count/reviews (lines 43–73). It never surfaces the user's own rating.

- **`apps/web/src/components/RatingControl.tsx`** — the writer. Inits `score = 0` / `review = ""`
  (lines 45–46); independently fetches `api.ratings.list(bookSlug)` into its *own* `summary` state
  (lines 52–65); button always reads "Submit rating" (line 177); on a successful write it
  `setSummary(next)` (line 105) but never prefills the user's own stars or re-reads the user's own
  rating. `isSovereign = session.user.email === null` (lines 69–70). Sovereign path:
  `api.ratings.template` → `nostr.signEvent` → `api.ratings.submit` (lines 87–94). Custodial path:
  `api.ratings.submitCustodial({ bookSlug, score, reviewText, reviewDate })` (lines 96–103). Both
  return `{ rating, summary }`.

- **`apps/web/src/routes/BookDetail.tsx`** — mounts `<RatingsPanel slug>` (line 121) and
  `<RatingControl bookSlug>` (line 122) as **independent siblings**. Each calls `api.ratings.list`
  on its own. There is no shared rating state today — the two components race on the same endpoint.
  BookDetail already calls `useTrustView()` (line 35) to derive the `observer` for the tag panel.

- **`apps/api/src/routes/ratings.ts`** (`GET /api/books/:slug/ratings`, lines 231–263) — queries
  `{ kinds: [39999], "#a": [bookAddress] }`, runs `dedupeRatings(events)` → `rawFromParsed(deduped)`
  to build `raw`, then computes `weighted` **separately** from the same `deduped` set filtered by the
  observer's trust weights (lines 246–257), and returns `{ ...raw, weighted }` (line 259).
  **Confirmed: `raw.ratings` is built before and independently of any observer/trust filtering**, so
  the user's own entry (matched by npub) is present in `raw.ratings` for *any* value of `?observer=`,
  including when their rating carries no trust weight and is therefore absent from `weighted`. This is
  the seam the honesty rule depends on.

- **`apps/api/src/ratings/summary.ts`** — `PublicRating` carries `npub`, `score`, `reviewText?`,
  `reviewDate` (lines 13–18); `dedupeRatings` keeps the latest event per rater (lines 58–86);
  `rawFromParsed` builds `{ count, average, ratings }` (lines 133–137). `weightedRatings` is the
  trust-filtered subset (lines 148–166) — the set the honesty rule forbids sourcing "own rating" from.

- **`packages/schemas/src/BookRating.ts`** — `buildBookRatingDTag(bookSlug, raterPubkey)` →
  `rating--<bookSlug>--<raterPubkey[:8]>` (lines 61–66); re-publish under the same d-tag replaces
  (lines 56–60). Unchanged.

- **`apps/web/src/hooks/useTrustView.ts`** — exposes `{ status, view, setView, personalize, error,
  npub }`; `npub` is the signed-in user's npub (line 44, from `session.user.npub`). The view is
  persisted in localStorage. **`useSession`** exposes `session.user.npub` and `session.user.email`
  (PublicUser, `apps/web/src/lib/api.ts` lines 5–9).

- **`apps/web/src/lib/api.ts`** — `api.ratings.template` / `submit` / `submitCustodial` / `list(slug,
  observer?)` (lines 257–293). `list` returns `RatingsSummary = { count, average, ratings, weighted? }`
  (lines 74–78). The edit reuses `template`/`submit`/`submitCustodial` verbatim.

### Constraints carried in

- **Honesty rule (non-negotiable).** The "Your rating" zone must render identically under House and
  Yours, and must be sourced from the user's own rating in the trust-view-independent `raw.ratings`
  list (keyed by npub), **never** from the trust-filtered `weighted` set (story §"Honesty rule").
- **No new crypto / no new write path** (crypto-policy; ADR 0005/0006). The edit reuses the existing
  signing paths exactly: sovereign NIP-07, custodial server ephemeral-wrap.
- **No change to the rating model, the aggregate, or the trust-weighting** (story Out-of-scope).
- **No new DList shape, no new tooling, no new runtime dependency** (CLAUDE.md house rules).
- **Architecture invariants.** POV-first / filter-at-view-time are *honored by leaving the aggregate
  alone*: "own rating" is the user's own self-asserted event read back to them (not a trust-weighted
  global), so it sits beside the POV aggregate exactly as kind-0 self-metadata does (cf. ADR 0028).
  Librarian pubkey stays runtime-resolved (it is, in `bookAddress`). npub-display / hex-internal
  preserved: `PublicRating.npub` is already npub; matching is npub-to-npub on the client.
- **Copy / visual (no-slop).** New strings ("Update rating", "You rated this on <date>. Saving will
  update it.", the in-place confirm/error) reviewed against `memory/feedback_unbnd_copy_and_visual.md`:
  no em dashes, no declarative-negatives, no celebratory toast, surface state in place. No new hex
  literal, no new icon library; reuse the existing `RatingControl.css` star/`rate-*` tokens.
- **Gate decisions (this story).** Un-rate/removal is **OUT** (deferred to Story 28b) — no removal is
  designed here. AC-4 framing is in-place/calm: prefilled control, "Update rating" button, one quiet
  "You rated this on <date>. Saving will update it." line, **no confirm modal**.

## Options considered

The forks are: **(F1)** the read source for "own rating" + whether the endpoint suffices; **(F2)** the
component boundary and how RatingsPanel and RatingControl stop racing on `api.ratings.list`.

### F1 — Read source for "your rating": endpoint shape

#### Option A — Reuse `GET /api/books/:slug/ratings`; derive own-rating from `raw.ratings` keyed by npub, but harden the query so the user's own event can never be truncated (chosen)

`raw.ratings` already carries every deduped rater's npub/score/reviewText/reviewDate, built before any
trust filtering (ratings.ts lines 237–239). The client finds the own entry by
`raw.ratings.find(r => r.npub === session.user.npub)`. No new endpoint, no new response field on the
happy path, and the honesty rule is satisfied structurally because `raw` is trust-view-independent.

**The one real risk** (Open Question 1's "list cap"): the GET route reads via the *un-paginated*
`queryEvents` (ratings.ts line 235 → `nostr/query.ts` `queryRelayUrl`), and strfry's per-REQ cap is
500 (`query.ts` line 87, `RELAY_PAGE_SIZE`). On a book with >500 ratings, the returned set is
truncated and the user's own rating *could* fall outside it — blanking "Your rating" for a user who
has in fact rated. That is a latent correctness hole in the honesty rule, not a hypothetical: the
aggregate is also truncated today, but the aggregate degrading gracefully is acceptable where a user's
own rating silently vanishing is not.

**Hardening (small, server-side, additive — kept inside this story):** when the request carries a
session (cookie present and resolvable to a user), the GET route does a **targeted own-rating read** by
the user's exact d-tag and adds a dedicated **`yourRating: PublicRating | null`** field to the
response, sourced from `raw`/own (NOT `weighted`). Concretely: resolve the session user (reuse
`deps.sessionUser`, already injected for the POST routes), build their d-tag
`buildBookRatingDTag(slug, user.pubkeyHex)`, and either (a) find it in the already-fetched `deduped`
set, or (b) if absent from that set (truncation), do one extra cheap `deps.query({ kinds: [39999],
authors: [user.pubkeyHex], "#a": [bookAddress] })` (author-scoped, returns at most the user's own
events for this book — one after dedup) and parse it via the existing `dedupeRatings`/`rawFromParsed`
path. `yourRating` is `null` for anon or never-rated. The client prefers `yourRating` when present and
falls back to scanning `raw.ratings` (so the field is purely additive and old clients keep working).

**Pros:** no new endpoint; reuses the existing read; the dedicated `yourRating` field guarantees
presence even past the 500-rating cap and makes the honesty seam *explicit in the contract* rather than
relying on the client digging through a possibly-truncated list; trivially testable on the API side
(mirror `ratings.test.ts` DI). **Cons:** a small additive change to the GET route and its response type
(one field) and, in the rare truncation case, one extra author-scoped query. Accepted: it is the
honest, cap-safe source, and the field is additive (no breaking change).

#### Option B — Pure client-side npub scan of `raw.ratings`, no API change at all

The PO's literal read: the client just does `raw.ratings.find(r => r.npub === myNpub)`; ship zero API
change.

**Cons:** correct only while a book has ≤500 ratings. Past the cap, `raw.ratings` is truncated and the
user's own rating can be silently absent, blanking "Your rating" for someone who *has* rated — a direct
honesty-rule violation that the story explicitly flags as the seam to protect. It also leaves the
honesty contract implicit (a future refactor of the panel could accidentally source own-rating from the
weighted set with no compile-time signal). Rejected: the cap risk is exactly what Open Question 1 asks
the Architect to check, and "find it in a list that might not contain it" is the wrong default for a
non-negotiable rule.

#### (Option C — a brand-new dedicated endpoint `GET /api/books/:slug/my-rating`)

A separate route returning only the caller's own rating.

**Cons:** more surface than needed (a whole route + client method + tests) when the existing GET can
carry one additive field; and it would force a *second* fetch on the book page (the panel already
fetches the same book's ratings), reintroducing the double-fetch race this ADR is trying to remove.
Rejected for completeness.

### F2 — Component boundary + reconcile (the double-fetch race)

#### Option A — Lift the read into a shared `useBookRatings(slug, observer)` hook owned at BookDetail; one source of truth; RatingsPanel and RatingControl become controlled (chosen)

Today RatingsPanel and RatingControl each call `api.ratings.list` independently (the race named in the
story / Open Question 3). Introduce **`apps/web/src/hooks/useBookRatings.ts`** as the single owner of
the book's rating data: it fetches the house summary (`api.ratings.list(slug)`) and, when the active
view is "Yours" with a resolved npub, the observer summary (`api.ratings.list(slug, npub)`) — i.e. it
absorbs the two `useEffect`s currently split across the two components — and exposes
`{ house, yours, yourRating, status, reload, applyWrite }`. `yourRating` is derived once
(prefer `summary.yourRating`, else scan `raw.ratings` by `session.user.npub`) from the **house/raw**
summary, so it is trust-view-independent (honesty rule). BookDetail calls the hook once and passes
the slices down: `<RatingsPanel … aggregate />` consumes `house`/`yours`; `<RatingControl … yourRating
applyWrite />` consumes `yourRating` for prefill and calls `applyWrite` to reconcile after a publish.
One fetch per (slug, view); one reconcile after a write; no two components racing on the same endpoint.

**Pros:** kills the double-fetch race with one obvious owner; one place derives own-rating (the honesty
seam lives in exactly one function); reconcile-after-write is a single `applyWrite` that updates both
the aggregate and own-rating slices, so the panel and the control can never disagree; mirrors the
existing test seams (the hook mocks `api`/`useSession`/`useTrustView` just like the components do
today). **Cons:** a new hook file and a controlled-component refactor of two existing components (they
stop owning their own `api.ratings.list` effect). Accepted — it is the structural fix the story asks
for, and it shrinks net logic (two effects collapse into one).

#### Option B — Leave the components independent; RatingControl gains its own own-rating read and, after a write, fires an event/callback to tell RatingsPanel to refetch

Keep both components self-fetching; wire a callback (`onRated`) from RatingControl up to BookDetail that
re-triggers RatingsPanel's fetch (mirrors the existing `TagControl onChanged={reloadTags}` pattern in
BookDetail lines 65–77).

**Pros:** smaller diff; reuses an established BookDetail callback idiom. **Cons:** the two components
*still* both call `api.ratings.list` on mount (the race the story explicitly calls out persists for the
initial load); own-rating would be derived in the control while the aggregate lives in the panel, so the
honesty seam is split across two components (easy to drift); and reconcile-after-write becomes a refetch
storm (control refetches its own summary, then signals the panel to refetch its two summaries).
Rejected: it does not remove the race, and it scatters the honesty seam — the precise thing Open
Question 3 wants consolidated.

## Decision

We chose **F1-A and F2-A.** Concretely:

### 1. Endpoint: reuse `GET /api/books/:slug/ratings`, add an additive `yourRating` field (own/raw-sourced, cap-safe)

No new endpoint. The existing GET gains one additive, optional field:

```
GET /api/books/:slug/ratings[?observer=…]
→ { count, average, ratings, weighted, yourRating }
```

- `yourRating: PublicRating | null` — the signed-in caller's own current rating for this book, or
  `null` when anonymous or never-rated. **Sourced from `raw`/own, never from `weighted`** (honesty
  rule). Resolution in the route:
  1. read the session via `deps.sessionUser(readSessionCookie(req))` (already injected for the POST
     routes; the GET stays public — no session just means `yourRating: null`);
  2. if a user resolves, look for their entry in the already-deduped set
     (`deduped.find(r => r.pubkey === user.pubkeyHex)`), map via the existing `toPublic`;
  3. if absent from that set (the >500-rating truncation case), do one author-scoped read
     `deps.query({ kinds: [39999], authors: [user.pubkeyHex], "#a": [bookAddress] })`, run it through
     `dedupeRatings`/`rawFromParsed`, and take the single own entry if present.
- The `?observer=` semantics are unchanged; `yourRating` is independent of `observer` (it is the
  caller's own, not the observer-trust-filtered set). The default-observer / house path is untouched.
- The field is additive: a client that ignores it still works; the web client prefers `yourRating` and
  falls back to scanning `raw.ratings` by npub. (`PublicRating.npub` is npub; if the client matches on
  npub it can compare directly. The server-side match is hex-to-hex internally, then `toPublic` emits
  npub — no hex ever reaches the client.)

This resolves Open Question 1 by *overriding* the PO's "no API change" default with a minimal additive
field, justified solely by the 500-rating cap risk to the honesty rule. The seam is now explicit in the
contract.

### 2. Read-own-rating seam (the one to protect) — exact source

`yourRating` (and the client fallback `raw.ratings.find(r => r.npub === session.user.npub)`) is the
**only** source for the "Your rating" zone. It is derived from the **house/raw** summary and is
**independent of the active trust view**. Switching House⇄Yours never re-derives own-rating from
`weighted`; the hook holds `yourRating` separately from `house`/`yours`, so toggling the view changes
only the *aggregate* slice the panel renders, never the own-rating slice the control prefills from
(AC-3). This is enforced structurally: own-rating lives on the house/raw path in one function in
`useBookRatings`, and `weighted` is never read by that function.

### 3. Component boundary + reconcile data flow

New hook **`apps/web/src/hooks/useBookRatings.ts`**, owned by `BookDetail`:

```
useBookRatings(slug) →
  {
    house:      RatingsSummary | null,   // api.ratings.list(slug)
    yours:      RatingsSummary | null,   // api.ratings.list(slug, npub) — only when view==='yours' && npub
    yourRating: PublicRating | null,     // from house.yourRating ?? house.ratings.find(npub) — trust-view-independent
    status:     'loading' | 'ready' | 'error',
    applyWrite: (summary: RatingsSummary, ownRating: PublicRating) => void,  // optimistic + reconcile entry point
    reload:     () => Promise<void>,     // refetch the house summary (and yours, if active)
  }
```

- The hook absorbs the two `useEffect` fetches currently split across RatingsPanel (lines 20–35) and
  RatingControl (lines 52–65) into **one owner**. `BookDetail` calls it once and passes slices down:
  - `<RatingsPanel slug … />` becomes controlled — it receives `house`/`yours`/`status` as props and
    keeps its existing House⇄Yours rendering logic (lines 43–115) verbatim, minus its own fetch
    effects. (`useTrustView` for the toggle stays in the panel; the hook also consumes `view`/`npub`
    to know whether to fetch `yours`.)
  - `<RatingControl bookSlug … yourRating applyWrite />` becomes controlled for own-rating — it
    receives `yourRating` for prefill (§5) and calls `applyWrite` after a successful publish instead of
    `setSummary`.
- **One fetch per (slug, view); one reconcile per write.** No two components racing on
  `api.ratings.list`. This resolves Open Question 3.

### 4. Optimistic update + reconcile + rollback (AC-6), both tiers (AC-7)

The edit reuses the **existing** write paths verbatim (AC-5) — no new endpoint, no new crypto:

- **Sovereign:** `api.ratings.template({ bookSlug, score, reviewText, reviewDate })` →
  `window.nostr.signEvent(template)` → `api.ratings.submit(signed)` (RatingControl lines 87–94).
- **Custodial:** `api.ratings.submitCustodial({ bookSlug, score, reviewText, reviewDate })`
  (lines 96–103).

Both publish under the same d-tag (replace, not duplicate) and return `{ rating, summary }`.

Flow on save (identical for both tiers, branching only at the signing step that already exists):

1. **Capture prior state** for rollback: the current `yourRating` (and the displayed aggregate).
2. **Optimistic:** immediately fill the "Your rating" zone to the new `{ score, reviewText, reviewDate
   = todayIso() }` and set the control status to `submitting`. The control's stars reflect the new
   score at once (AC-6 "fills immediately").
3. **Publish** via the tier path above.
4. **Reconcile on success:** the POST returns the refreshed aggregate `summary`. Call
   `applyWrite(summary, ownRating)` where `ownRating` is the just-saved rating (the server has already
   read back the aggregate; the own-rating is authoritative locally as the value we just published
   under our own d-tag). `applyWrite` updates the hook's `house` (aggregate) and `yourRating`
   (own) slices in one step, so the panel and the control reconcile to the same saved state with no
   manual refresh. (A `reload()` is available if a belt-and-suspenders re-read is wanted, but the POST's
   returned summary already reflects the write — no extra fetch on the happy path.)
5. **Rollback on failure:** if the publish or the read-back throws, restore the captured prior
   `yourRating` and aggregate (so the stars snap back to the prior score), set status to `error`, and
   show an honest in-place message (no false "saved", no toast). On success show a quiet in-place
   confirmation (reuse the existing `rate-ok` `role="status"` line, lines 166–170), not a celebratory
   toast (no-slop rule).
6. **Custodial `reauth_required` (401) case (AC-7 / Open Question 4):** when the custodial session's
   ephemeral signing key has been evicted (process restart), `api.ratings.submitCustodial` rejects with
   an `ApiError` whose code is `reauth_required` (ratings.ts lines 151–159). The control detects this
   specific code and shows an honest "Sign in again to update your rating." message (plain copy, no
   em dash, links to `/auth`), and **rolls back** the optimistic state to the prior rating. This is a
   distinct branch from the generic publish failure so the user is told the truthful, actionable thing.

### 5. Prefill + framing (AC-4) — in-place/calm, no modal

When `yourRating` is non-null (the user has rated), `RatingControl` initializes from it instead of
`score = 0` / `review = ""`:

- `score` ← `yourRating.score`; `review` ← `yourRating.reviewText ?? ""` (prefilled stars + textarea).
- The primary button label switches from "Submit rating" to **"Update rating"** (replacing the
  line-177 literal). For a never-rated user (`yourRating === null`) it stays "Submit rating".
- One quiet already-rated line renders above/near the control: **"You rated this on <date>. Saving will
  update it."** where `<date>` is formatted from `yourRating.reviewDate`. (AC-2's "You rated this on
  <date>" is the same source; the panel/zone shows the date for an existing rating and shows nothing
  for a never-rated user.) **No confirm modal, no destructive "overwrite?" warning** (gate decision).
- Prefill is derived purely from the own-rating read (§2), so it is correct under both House and Yours
  and survives a view toggle (AC-3).
- **Signed-out (AC-8):** `yourRating` is `null` and the session is signed-out → the existing sign-in
  prompt (RatingControl lines 132–136) renders unchanged; no "Your rating" zone, no prefilled control.
  The House aggregate continues to render for signed-out visitors (panel is unchanged for that path).

### 6. The "Your rating" zone — where it lives

The zone (filled stars + "Your rating" label + the date line + the prefilled review) lives **inside
`RatingControl`**, which becomes the unified display+editor for the user's own rating. `RatingsPanel`
stays the *aggregate* (House⇄Yours consensus + reviews list) and gains no own-rating responsibility.
Rationale: the control already owns the interactive stars and the review textarea, so making it the
prefilled editor keeps display and edit in one place (the story's "the rating control IS the editor"),
while the panel stays purely the POV aggregate. The single shared `useBookRatings` hook is what keeps
the two in sync after a write (§3) without merging them into one component.

## Consequences

- **Enables** AC-1–AC-8: the signed-in user always sees their own current rating (filled stars +
  "Your rating" + date), under both House and Yours; the control is the prefilled in-place editor with
  "Update rating" framing and the quiet already-rated line; edits republish under the existing d-tag
  (replace) via the existing per-tier write path; the change lands optimistically and reconciles without
  a reload, with honest rollback (including the custodial reauth case). Removes the double-fetch race
  between RatingsPanel and RatingControl.
- **Constrains:** the GET ratings response grows one additive field (`yourRating`), and a session lookup
  on the (still-public) GET when a cookie is present. In the rare >500-ratings case the route does one
  extra author-scoped query to guarantee own-rating presence. Two web components become controlled by a
  shared hook (they no longer own their own fetch). The aggregate/trust-weighting and the rating model
  are untouched.
- **Debt / follow-ups:** **Un-rate / removal is explicitly deferred to Story 28b** (kind-5 deletion /
  tombstone — out of scope here, no removal designed). The strfry-live read per request (no Neo4j read
  model) is unchanged (ADR 0005 follow-up). The author-scoped own-rating fallback is a targeted patch
  for the cap; a general paginated aggregate read remains future scope.
- **Affects existing fixtures?** No DList/production fixtures. The web component tests change (controlled
  props + new prefill/edit cases — see Testable seams); the API `ratings.test.ts` gains `yourRating`
  cases. No fixture *data* files change.
- **New dependency?** No. Reuses `api.ratings.template`/`submit`/`submitCustodial`/`list`,
  `useSession`, `useTrustView`, `buildBookRatingDTag`, `dedupeRatings`/`rawFromParsed`/`toPublic`,
  `deps.sessionUser`/`deps.query`. No new crypto, no new icon library, no new hex literal.
- **PRD section change required?** No. Implements §2.5/§2.6 as written; touches no §11.3 surface.
- **Brand tokens / copy:** the only new UI is the "Your rating" zone + the relabeled button + the quiet
  date line, all inside the existing `RatingControl.css` `rate-*` token classes (no new hex, no new
  icon library). New strings ("Update rating", "You rated this on <date>. Saving will update it.",
  "Sign in again to update your rating.", the in-place confirm/error) reviewed against
  `memory/feedback_unbnd_copy_and_visual.md`; final wording is the Implementer's within that constraint.

## Testable seams (call out for the Tester)

Mirror the existing patterns — web tests mock `api` / `useSession` / `useTrustView` (see
`apps/web/test/components/rating-control.test.tsx`, `rating-control-custodial.test.tsx`,
`ratings-panel.test.tsx`); API tests use the `buildRatingsRouter` DI in
`apps/api/test/routes/ratings.test.ts`. **Inject deps; do not `vi.mock` intra-module calls.**

- **`useBookRatings` (new web hook)** — testable by mocking `api.ratings.list` / `useSession` /
  `useTrustView`. Assert: house fetch once on mount; `yours` fetched only when `view==='yours' && npub`;
  `yourRating` derived from `house.yourRating` (preferred) else `house.ratings.find(npub)`, and
  **identical across a House⇄Yours toggle** (AC-3); `applyWrite` updates both the aggregate and
  `yourRating` slices; rollback restores the captured prior state.
- **`RatingControl` (now controlled)** — props `yourRating` + `applyWrite` are the injectable seam.
  Assert: `yourRating` non-null ⇒ stars prefilled to its score, textarea prefilled to its review, button
  reads "Update rating", the "You rated this on <date>" line renders (AC-1/AC-2/AC-4); `yourRating` null
  + signed-in ⇒ empty control, "Submit rating", no date line (AC-2/AC-4); signed-out ⇒ sign-in prompt,
  no zone (AC-8); save ⇒ optimistic fill, then on resolve `applyWrite` called with the saved
  rating (AC-6); on reject ⇒ rollback + error, no false "saved" (AC-6); custodial `submitCustodial`
  rejecting with `reauth_required` ⇒ "sign in again" message + rollback (AC-7); sovereign path still
  runs `template → signEvent → submit` (AC-5/AC-7); both publish under the same d-tag (the template/
  submit calls are unchanged, so the existing d-tag assertions hold).
- **`RatingsPanel` (now controlled)** — receives `house`/`yours`/`status` as props instead of fetching;
  existing House⇄Yours rendering assertions (`ratings-panel.test.tsx`) port to prop-driven inputs.
- **`GET /api/books/:slug/ratings` (`ratings.ts`)** — inject `sessionUser` + `query`. Assert:
  anon (no cookie) ⇒ `yourRating: null`; signed-in user present in the ≤500 set ⇒ `yourRating` is their
  `toPublic` entry (npub, score, reviewText, reviewDate), sourced from `raw`, **independent of
  `?observer=`**; signed-in user whose rating is *outside* the first 500 (truncation) ⇒ the route's
  author-scoped fallback query is invoked and `yourRating` is still populated (the cap-safety guarantee);
  a user whose rating carries no trust weight (absent from `weighted`) ⇒ `yourRating` still present
  (honesty rule); never-rated signed-in user ⇒ `yourRating: null`. The existing `weighted`/`raw`
  assertions are unchanged.

## Ripple / new files

**New files**

- `apps/web/src/hooks/useBookRatings.ts` — the shared rating-data owner (§3). *(Implementer)*
- `apps/web/test/hooks/use-book-ratings.test.tsx` — DI-mocked hook tests. *(Tester-owned)*

**Modified (web)**

- `apps/web/src/routes/BookDetail.tsx` — call `useBookRatings(slug)` once; pass `house`/`yours`/`status`
  to `RatingsPanel` and `yourRating`/`applyWrite` to `RatingControl` (lines 121–122 region).
- `apps/web/src/components/RatingControl.tsx` — accept `yourRating` + `applyWrite` props; prefill
  `score`/`review` from `yourRating` (replacing the `0`/`""` init, lines 45–46); switch the button label
  to "Update rating" when `yourRating` is non-null (line 177); render the "You rated this on <date>"
  line; replace `setSummary(next)` (line 105) with the optimistic+reconcile `applyWrite` flow (§4); add
  the `reauth_required` branch (§4.6); drop its own `api.ratings.list` effect (lines 52–65).
- `apps/web/src/components/RatingsPanel.tsx` — become controlled: take `house`/`yours`/`status` as props
  and drop its two fetch effects (lines 20–35); keep the House⇄Yours rendering (lines 43–115).
- `apps/web/src/lib/api.ts` — add the optional `yourRating?: PublicRating | null` field to the
  `RatingsSummary` type (lines 74–78). No new method (the edit reuses `template`/`submit`/
  `submitCustodial`; the read reuses `list`).

**Modified (api — tiny, additive)**

- `apps/api/src/routes/ratings.ts` — in `GET /api/books/:slug/ratings` (lines 231–263): resolve the
  optional session via `deps.sessionUser`, compute `yourRating` from `deduped` (own d-tag / hex match)
  with the author-scoped fallback for the >500 cap, and include it in the response
  (`res.json({ ...raw, weighted, yourRating })`). No change to `raw`/`weighted` computation.
- `apps/api/src/ratings/summary.ts` — *no change needed* (`toPublic` and `dedupeRatings`/`rawFromParsed`
  are reused as-is; if a thin "find own rating" helper is wanted it is a pure function added here, no
  behavior change to existing exports). The `PublicRating` type is exported already (used by the new
  field).

**Existing tests that change**

- `apps/web/test/components/rating-control.test.tsx` + `rating-control-custodial.test.tsx` — add
  prefill/"Update rating"/date-line/optimistic-rollback/reauth cases; adjust to controlled props.
- `apps/web/test/components/ratings-panel.test.tsx` — port from self-fetch to prop-driven inputs.
- `apps/web/test/book-detail-trust-view.test.tsx` — may need the new hook wired in the BookDetail render.
- `apps/api/test/routes/ratings.test.ts` — add the `yourRating` cases above.
- *(Test Design phase pins exact assertions and any further files.)*

**DList shapes:** none new, none changed. kind-39999 ratings are read and re-published under the
existing `rating--<bookSlug>--<raterPubkey[:8]>` d-tag (replace); kind-39998 `book-ratings` header role
unchanged.

## Out of scope

- **Removing / un-rating** a rating (kind-5 deletion / tombstone) — deferred to **Story 28b**; no removal
  is designed here (gate decision).
- Any change to the rating **model** (stays kind-39999 addressable/replaceable).
- Any change to the **aggregate** or **trust-weighting** (`summarizeRatings`, `weightedRatings`, the
  House⇄Yours labels — untouched).
- A **confirm modal / "overwrite?" warning** for the edit (gate decision: in-place/calm only).
- Own-rating surfacing for anything but **book ratings** (no genre/tag/shelf own-state here).
- A general paginated aggregate read model / Neo4j-backed ratings (ADR 0005 follow-up).
- New lint/typecheck/build tooling (CLAUDE.md house rule).

# ADR 0065: Taste Match on book detail — batched per-rater match + taste sort

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/done/66-taste-match-book-detail.md`

## Context

Story #66 puts a taste-match chip on every rater/reviewer byline on a book detail page, plus a "Most trusted / Best taste match" sort, signed-in only, honest below the overlap threshold (PRD §5.2). It reuses ADR 0064's pure `computeTasteMatch` and `TASTE_MATCH_MIN_OVERLAP`.

The hard constraint: `computeTasteMatch(viewer, rater)` needs each rater's *full* rating history (the co-rated set spans the whole catalog, not just this book). A book's raters come from `GET /api/books/:slug/ratings` (`deduped.map(r => r.pubkey)`). Computing a match per rater naively is one history read per rater — N+1 on a page. The established bounded pattern is For-You (`apps/api/src/routes/foryou.ts`): read the relevant ratings in a small number of batched reads, group in memory, compute pure. No new DList shape (read-only over `book-ratings`).

The byline UI: `RatedByRow` (rate-only raters) and the reviews list inside `RatingsPanel` both render `PublicRating` bylines (`{ npub, score, reviewText, reviewDate }`); `useBookRatings` owns the book's rating fetch and the House/Yours perspective.

## Options considered

### Option A — New batched endpoint + in-memory compute (chosen)
A new `GET /api/books/:slug/taste-matches` (signed-in only, read-time, never cached):
1. Read this book's ratings (`#a`:[bookAddr]) → the deduped rater pubkeys.
2. ONE batched author-scoped read `{ kinds:[39999], "#z":[ratingsZ()], authors:[viewerHex, ...raterHexes] }` (capped) → all the relevant histories in one read.
3. Group by author (`scoresByAuthor`) → `Map<authorHex, Map<slug, score>>`.
4. `computeTasteMatch(viewerMap, raterMap)` per rater → `{ matches: { [npub]: { commonBooks, thresholdMet, percentage? } } }`.
Signed out → `{ signedIn: false }` (web hides chips + the sort control).
- **Pros:** two bounded reads, never N+1; reuses the #65 metric and the For-You in-memory pattern; isolated from the public ratings endpoint; observer-relative, read-time (POV-first, filter-at-view-time).
- **Cons:** a second read alongside the ratings read on book detail (cheap on the current graph; bounded by the rater cap + the paged cap).

### Option B — Extend `GET /api/books/:slug/ratings`
Fold per-rater taste-match into the existing public ratings read.
- **Cons:** that endpoint is public and reads only *this* book's ratings; adding the multi-author history read couples taste-match into the core read and makes it observer-heavy even when no taste sort is in play. Rejected (mirrors the #65 separate-endpoint decision).

### Option C — One author-scoped read per displayed rater
- **Cons:** N+1 reads per page. Rejected.

## Decision

**Option A.** New `apps/api/src/routes/book-taste-matches.ts` → `GET /api/books/:slug/taste-matches`, a `scoresByAuthor` helper in `ratings/summary.ts` (generalizes `scoreBySlug`), reuse of `computeTasteMatch`. The web adds `api.ratings.tasteMatches(slug)`, a sort toggle in `RatingsPanel`, and a compact byline chip in `RatedByRow` + the reviews list. v1 raw agreement, independent of the House/Yours toggle. The batched authors array is capped (the relay filter limit, 500) — a book with more distinct raters computes matches for the first 500 in deduped order; the rest render no chip (logged; a no-op on today's graph).

## Consequences
- Enables the Trusting Reader to weigh a book through people who read like them.
- Constrains: v1 raw pairwise, no trust weighting (the variant is a later story). The sort's "no match" raters (below threshold / over the cap) sort after the matched ones, preserving their trust order among themselves.
- **Affects existing fixtures?** No. The visual-regression `book-detail` baseline is signed-out → no chips, no sort control → no baseline change.
- **New dependency?** No.
- **New DList shape?** No (read-only over `book-ratings`).
- **New config?** No (reuses `TASTE_MATCH_MIN_OVERLAP`).
- **PRD section change required?** No.

## Implementation notes
- **`apps/api/src/ratings/summary.ts`** — add `scoresByAuthor(events): Map<string, Map<string, number>>`: group events by `event.pubkey`, then fold each group with the existing per-slug latest-wins logic (factor the body shared with `scoreBySlug`). Pure.
- **`apps/api/src/routes/book-taste-matches.ts`** (new): `buildBookTasteMatchesRouter(deps)` with `GET /api/books/:slug/taste-matches`. Deps `{ config, sessionUser, query, queryPaged }`. Signed out → `{ signedIn:false }`. Resolve the book address (reuse `bookAddress(config, slug)`); read the book's raters via `query({ kinds:[39999], "#a":[addr] })` → dedupe → rater hexes (cap 500). One `queryPaged({ kinds:[39999], "#z":[ratingsZ()], authors:[viewer.pubkeyHex, ...raterHexes] })`; `scoresByAuthor`; per rater `computeTasteMatch(viewerMap, raterMap, minOverlap)`; key the result by `npubEncode(raterHex)`. Best-effort: a read failure → `{ signedIn:true, matches:{} }`, never 500. Never cached.
- **`apps/api/src/index.ts`** — register the router (deps from `userEventDeps`).
- **`apps/web/src/lib/api.ts`** — `api.ratings.tasteMatches(slug)` → `{ signedIn:false } | { signedIn:true; matches: Record<string, BylineTasteMatch> }` where `BylineTasteMatch = { commonBooks:number; thresholdMet:boolean; percentage?:number }`.
- **`apps/web/src/hooks/useBookRatings.ts`** (or `BookDetail.tsx`) — fetch the matches map when signed in; expose `tasteMatches` + a `sortBy: "trusted" | "match"` state (default "trusted").
- **`apps/web/src/components/RatingsPanel.tsx`** — render the sort toggle (signed-in only, `@unbnd/ui` `Link`/`Button`, default "Most trusted"); thread `tasteMatches` + `sortBy` into `RatedByRow` and the reviews list; when `sortBy==="match"`, order bylines by `percentage` desc with un-matched raters after, trust order preserved among them.
- **`apps/web/src/components/RatedByRow.tsx`** — accept `tasteMatches?` and render a compact match label on a byline when present and `thresholdMet` (a neutral token-only treatment, never the amber accent); no chip below threshold.

## Out of scope
- Caching (read-time for v1, mirrors For-You).
- The trust-weighted taste-match variant and House/Yours dependence (later story).
- The profile chip (#65, shipped) and the hype-gap signal (#70).

# ADR 0010: Web goes live — book-read API + live read paths + classification UI

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/9-web-goes-live.md`

## Context

Staging has live data (catalog on the local relay synced from dcosl, ratings, taxonomy + genre assertions) and write/consensus APIs, but the web still renders the `apps/web/src/data/book-fixtures.ts` fixture (one book, gradient covers, fabricated reviews/distribution). This story adds book-read endpoints, swaps the web onto live data, and surfaces the classification UI. Reads go through `apps/api` → the **local** strfry (`queryEvents`, same path as ratings/tags). No GrapeRank (raw consensus only), no search.

## Decision

### Book-read API (`apps/api/src/routes/books.ts`, read-only, public)
- `GET /api/books/:slug` → `queryEvents({ kinds:[39999], "#z":[booksConcept], "#d":[slug] })` → `fromWireEvent`+`fromBookRecordEvent` → `PublicBook`. 404 when absent.
- `GET /api/books?slugs=a,b,c` → batch read (one relay query with `"#d":[…]`), returns the found books in request order. Powers genre browse.
- `GET /api/books?limit=N` (no slugs) → recent catalog sample for the homepage shelf.
- `booksConcept = 39998:<librarianPubkey>:books`. 503 if `librarianPubkey` unset.
- `PublicBook` = the domain `BookRecord` fields the UI needs: `slug, title, authorName, blurb?, coverUrl?, publishYear?, openLibraryId?, subjects?, format`. No hex; no trust.

### Web client (`apps/web/src/lib/api.ts`)
`api.books.get(slug)`, `api.books.list({ slugs })`, `api.books.recent(limit)`; `api.tags.list()`, `api.tags.book(slug)`, `api.tags.genreBooks(slug)`, `api.tags.template/submit/submitCustodial` (apply/dispute).

### Web read-path swap
A **view-model** maps `PublicBook` (+ tags consensus + ratings summary) to what components render. Retire the fixture on these surfaces; keep a small render-helper for cover fallback.
- **BookDetail** (`/book/:slug`): fetch `api.books.get(slug)` + `api.tags.book(slug)` + `api.books/:slug/ratings`. Renders: header (real `coverUrl` with a gradient fallback when absent; title/author/blurb/year); **genre/style chips** from tags consensus (raw apply counts, accusatory already hidden by the API, no trust number); ratings summary (avg + count) + **real reviews** from the ratings whose `reviewText` is set; apply/dispute control; rating control (exists). Drop the fabricated distribution + fake reviews + claimed-author card (or simplify to `authorName`). Unknown slug → `NotFound`.
- **GenreBrowse** (`/genre/:slug`): `api.tags.genreBooks(slug)` → slugs → `api.books.list({slugs})` → cards. Empty genre reads honestly.
- **Homepage**: `api.books.recent(limit)` → one "recently added" shelf. **No fabricated trending/community/recommended shelves** (need activity + GrapeRank — deferred, not faked).
- Every surface: loading / empty / error states.

### Classification UI (`apps/web/src/components/TagControl.tsx`)
Mirrors `RatingControl`: tier-gated (`useSession`; sovereign signs via `window.nostr`, custodial via `submitCustodial`, signed-out → sign-in prompt). Genre/style **chips** show consensus; an **apply/dispute picker** lists the taxonomy (`api.tags.list()`, non-accusatory only) and writes an assertion. Genre + style only (quality-signal write UI deferred). Brand tokens; hand SVG; no-slop copy; no trust numbers.

### Seed + verify
Full droplet re-seed (`docker compose --profile seed run -d --rm seeder`) so taxonomy + genre assertions cover the catalog; sync brings them local; E2E on staging: browse genre → open book → see chips + ratings → (signed in) apply a genre → reload shows it.

## Options considered
- **Book lookup by `#d`+`#z` (chosen)** vs scanning all librarian 39999s and filtering app-side (heavier). `#d`+`#z` is one filtered query, relay-side.
- **Batch `?slugs=` for genre browse (chosen)** vs N per-book calls (N round-trips). Batch is one query.
- **Homepage "recently added" (chosen)** vs fabricated trending shelves (rejected — fake trust/activity) vs empty homepage (worse UX).

## Consequences
- Enables the feature-complete staging target: real browsable, classifiable catalog with both rating tiers. Foundation for search (next) and GrapeRank (later).
- Constrains: homepage is a simple recent shelf until activity/GrapeRank exist; book detail loses the fixture's fabricated reviews/distribution (real reviews come from rating `reviewText`); cover falls back to a gradient when OL has none.
- **Fixtures:** `book-fixtures.ts` retired on home/genre/book-detail; existing route smoke tests updated to the live-data shape (mock the API).
- New dependency? No. PRD change? No. Migration? None.

## Out of scope
Search; GrapeRank/trust-weighting + trust shelves + sensitive-tag gate; author claim/submission; quality-signal write UI; real-time updates; pagination polish.

## Implementation notes (staged sub-PRs)
1. **book-read API** — `routes/books.ts` (get/batch/recent) + `BookRead`/`PublicBook` mapping + tests (mocked `query`) + `index.ts` wiring (reuse `userEventDeps.query`).
2. **web read swap** — `api.books.*` client; view-model; BookDetail/GenreBrowse/Homepage off live data + states; adapt `BookHeader`/`RatingsBlock`/`ReviewsList`; update route smoke tests.
3. **classification UI** — `TagControl` (chips + picker + apply/dispute) on BookDetail; component tests (mock api + session, tier-gated).
Then re-seed + staging E2E.
Reuse `fromWireEvent`/`fromBookRecordEvent`, `queryEvents`, the `api`/`useSession` patterns. No fixtures on live surfaces; no fake trust numbers.

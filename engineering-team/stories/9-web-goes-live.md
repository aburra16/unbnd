# Story 9: Web goes live — live catalog reads + classification UI

**Status:** Draft
**Created:** 2026-05-29
**Type:** Feature

## Background

Staging now has real data — a catalog (Open Library → dcosl → local strfry), ratings, and the classification layer (taxonomy + genre assertions) — plus a full API. But the **web still renders fixtures** (the single *Orbital* book). This story swaps the web to read the **live catalog** through the API and surfaces the **classification UI** (genre/style chips, apply/dispute picker, genre browse), folding in story 8's deferred web stage. After it, staging is the agreed "feature-complete" target: a real, browsable, community-classifiable catalog with both rating tiers — bar search (its own story) and GrapeRank (later).

## User-facing description

As a reader, I want the homepage, book pages, and genre browse to show **real books** from the catalog (not a demo), with community genre/style tags and ratings; and as a signed-in user I want to **apply or dispute** a genre/style on a book. As the operator, I want the full catalog (taxonomy + genre assertions) seeded so all of this is populated.

End state on staging: browse real books by genre, open a real book detail with its blurb/cover/ratings/genre+style chips, and (signed in) apply/dispute a classification — all off live data.

## Acceptance criteria

- [ ] AC-1: **Book-read API** — `GET /api/books/:slug` returns a book record (from the local relay), `GET /api/books` returns a catalog sample/recent shelf for the homepage. Both read the live relay (same pattern as ratings/tags reads); honest empty states.
- [ ] AC-2: **Book detail off live data** — the BookDetail route renders a real book record (title, author, blurb, cover, where-to-read links as available) for a real `:slug`, not the fixture. Unknown slug → not-found.
- [ ] AC-3: **Ratings on book detail are live** — the existing `/api/books/:slug/ratings` summary (raw average + count, no trust number) drives the page; the rating control already works.
- [ ] AC-4: **Genre/style chips** — book detail shows the book's genre/style consensus from `/api/books/:slug/tags` (accusatory hidden); each chip shows the raw apply count, no trust number.
- [ ] AC-5: **Apply/dispute control** — a signed-in user picks a genre/style from the taxonomy (`/api/tags`, no free-form) and applies or disputes it; sovereign client-signs, custodial server-signs (the story-8 API). Signed-out → sign-in prompt.
- [ ] AC-6: **Genre browse off live data** — `/genre/:slug` lists the real books with net-positive consensus for that genre (`/api/genres/:slug/books` → render each via the book-read API). Empty genre reads honestly.
- [ ] AC-7: **Homepage off live data** — replace the fixture shelves with a real catalog shelf (e.g. recently added / a sample); no fabricated "trending/trust-weighted" shelves (those need activity + GrapeRank — deferred, not faked).
- [ ] AC-8: **Full catalog seeded** — re-run the seeder on the droplet so the taxonomy + baseline genre assertions cover the whole catalog; the sync brings them into the local relay; verified end-to-end on staging (browse → book → chips → apply).
- [ ] AC-9: Loading/empty/error states for all live reads; no fixture imports remain on these surfaces; copy follows the no-slop rules; no fake trust numbers anywhere.

## DList shapes touched

Reads only (no new shapes): `BookRecord` (kind 39999), `BookTag` + `BookTagAssertion` (kind 39999), `BookRating` (kind 39999) — all via the API off the local relay.

## Out of scope

- **Search** — its own story (Meilisearch indexing + search UI).
- **GrapeRank / trust-weighting** + trust-weighted shelves + the sensitive-tag gate — Layer 2.
- **Author submission / claim**; quality-signal *write* UI (genre/style first; signals reuse the same mechanism later).
- Real-time updates; infinite scroll/pagination polish (basic paging acceptable).

## Open questions

- Homepage shelf content without trust/activity data — "recently added" vs a fixed editorial sample. (Recommend recently-added from the catalog.)
- Book-detail fields actually present on seeded records (cover/blurb/where-to-read) vs gracefully omitted.
- Genre browse ordering (by apply count?) and page size.
- Staging implication: re-seed is large; run detached (as before) and let the sync catch up.

## Staging / staged delivery

Sub-PRs: (a) book-read API; (b) web read-path swap (home/genre/book-detail off API + states); (c) classification UI (chips + picker); then the droplet re-seed + end-to-end verification.

## Linked artifacts

- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)

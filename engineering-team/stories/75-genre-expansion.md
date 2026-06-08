# Story 75: Genre expansion to 14+

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
Browse offers 8 genres today (`apps/seeder/src/taxonomy.ts` `STARTER_TAXONOMY`: literary-fiction, science-fiction, mystery, romance, fantasy, thriller, biography, history). The social-loop PRD calls for expanding this to 14+ and recasting the existing catalog into the richer set, so readers can browse the catalog the way they actually think about books (§5.6; §8.1 Block 2). Genre is "a revisable assertion derived from each book's preserved Open Library subjects; the expansion recasts existing books with no re-fetch" (PRD §5.6).

The data model already supports an arbitrary taxonomy: genres are kind-39998 `book-tags` concept elements; a book's membership in a genre is a librarian-signed kind-39999 tag assertion (net-positive consensus via `aggregateBookTags` / `aggregateGenreBooks`); the read + browse APIs (`/api/tags`, `/api/genres/:slug/books`) and the web grid (`GenreGrid`, `genreColor`) render whatever taxonomy exists. Every catalog book record (kind 39999) **preserves its full Open Library `subjects` array** (`BookRecord.subjects`), stored at seed time and kept — so a recast can re-derive with no external fetch.

What does NOT exist yet: a true `subjects → genres` derivation. Today a book's genres come from the OL **fetch bucket** it was seeded under (the seeder tracks which subject-search reached it), not from its stored `subjects`. Recasting the already-seeded catalog into 14+ genres therefore needs a real mapping over the preserved subjects, plus a one-time job that re-derives and publishes the new genre assertions across the existing ~11.2k books — without re-fetching Open Library.

Anchor: `product-team/prd/social-loop.md` §5.6, §8.1. Wireframe: `product-team/guides/social-loop-wireframes.html` (browse/Explore-genres grid).

## User-facing description
As a reader, I want to browse the catalog across 14+ genres that match how I think about books, with every existing book sorted into the richer set, so that browsing surfaces more of the catalog through more entry points.

## Proposed taxonomy (product decision — confirm/adjust at the gate)
The 8 existing genres plus a proposed set of additions to reach 16 (each maps to common Open Library subjects):
**Horror, Poetry, Young Adult, Graphic Novels, Philosophy, Science, Self-Help, Memoir.**
This is a curated product decision, not data-derived clustering. If a founding-curator genre survey is available it should inform the final list; otherwise this candidate is the starting point. The exact list and labels are confirmed in the Planning gate.

## Acceptance criteria
Testable from the outside.

- [ ] The genre taxonomy contains 14 or more genres, and the browse grid offers all of them (each links to its genre page; each has a distinct color).
- [ ] Each existing catalog book is assigned to the expanded genres **derived from its preserved Open Library subjects**, with **no external re-fetch** (the derivation reads only the stored `subjects` on the book record).
- [ ] The existing catalog is recast: after the recast, books that match a new genre's subjects appear under that genre.
- [ ] Browsing a new genre (`/api/genres/:slug/books` and `/genre/:slug`) returns its books.
- [ ] The recast is idempotent and non-destructive: re-deriving does not duplicate or contradict a book's existing genre assertions, and curator/user apply-dispute assertions are preserved (the librarian re-derivation is one voice in the net-positive consensus, not a wipe).
- [ ] A book whose preserved subjects match no genre is simply unsorted (no fabricated genre); genres with no matching books are absent from browse, never shown empty.

## DList shapes touched
- `kind:39998` — `book-tags` concept: add the new genre elements (`type: "genre"`), librarian-signed.
- `kind:39999` — `book-tag-assertions`: new librarian genre assertions (`tagType: "genre"`, `polarity: 1`) for each (book, new-genre) pair the recast derives. Reuses the existing assertion shape/identity (`tagassert--<book>--<genre>--<asserter8>`).
- Reads `kind:39999` book records' preserved `subjects` (no write, no OL fetch).
- No new concept or kind.

## Out of scope
- Re-fetching Open Library or changing the seeder's fetch path (the recast derives from stored subjects only).
- Data-derived / ML genre clustering — the taxonomy is a curated product list (PRD §5.6).
- Sub-genres, multi-level taxonomy, or genre hierarchy.
- Changing the net-positive consensus / aggregation logic, or the apply/dispute write path.
- Styles and signals (only genres expand here).

## Open questions
For the Architect (Phase 2):
1. **The `subjects → genres` derivation.** The core new logic: a deterministic mapping from a book's preserved OL subject strings to the expanded genre slugs (keyword/substring rules per genre, multi-genre allowed). Where it lives (a shared module both the seeder and the recast use, so future seeds and the recast agree) and how it handles the existing 8 (re-derive all, or only add the new 6+).
2. **Where the recast runs + idempotency.** A one-time batch over the existing catalog (extend the seeder with a no-fetch "recast" mode, a new script, or the librarian app): read each book record's `subjects`, derive genres, publish only the librarian assertions that are missing (idempotent; never duplicate; never overwrite curator/user assertions). How it reads ~11.2k records within the relay-cap discipline (paged reads, ADR 0021).
3. **Color palette for 14+.** `GENRE_PALETTE` has 8 rows and `genreColor` hashes the slug into the palette; expanding needs 14+ distinct colors and care that adding/reordering does not rebind existing genres to jarring colors. Architect/Design confirm the palette extension.
4. **Staging.** Whether to ship taxonomy + recast first, then the browse-grid/palette polish (the notes allow staging).

## Linked artifacts
- ADR: `engineering-team/decisions/0073-genre-expansion.md` (Accepted)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)

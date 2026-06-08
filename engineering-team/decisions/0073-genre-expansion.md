# ADR 0073: Genre expansion to 16 + a no-fetch recast from preserved subjects

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/75-genre-expansion.md`

## Context
Eight genres exist in `apps/seeder/src/taxonomy.ts` `STARTER_TAXONOMY`; the seed assigns a book's genres from the **OL fetch bucket** it was searched under (`SUBJECTS` in `apps/seeder/src/index.ts`, tracked via `dedupBooks`), then publishes one librarian `BookTagAssertion` per bucket (`tagType: "genre"`, `polarity: 1`). The data model is generic: genres are kind-39998 `book-tags` elements; membership is a net-positive consensus of kind-39999 assertions; `/api/tags`, `/api/genres/:slug/books` (`aggregateGenreBooks`), and the web `GenreGrid` render whatever taxonomy + assertions exist. Every book record preserves its full OL `subjects` array (`BookRecord.subjects`).

To reach 16 genres and recast the existing ~11.2k catalog **with no re-fetch**, three things are needed that don't exist today:
1. A real **`subjects → genres` derivation** (today genres come from the fetch bucket, not the stored subjects).
2. A **recast job** that reads existing records and publishes the new librarian assertions (no OL fetch).
3. **Distinct colors for 16 genres.** `genreColor(slug)` (`apps/web/src/lib/view-model.ts`) is `GENRE_PALETTE[hash(slug) % length].bg` — the **same palette the cover gradients hash into**. Naively appending rows changes `length`, which **re-colors every book cover and avatar** — unacceptable churn.

Idempotency is already structural: the assertion d-tag is `tagassert--<book>--<genre>--<asserter8>` (per author+book+tag). Re-publishing a librarian (book, genre) assertion **replaces** by d-tag (no duplicate); curator/user assertions carry a different `asserter8` → a different d-tag → untouched.

Constraints: librarian pubkey at runtime; relay-cap discipline on reads; brand-consistent colors; no-slop; no new dependency.

## Decision
Four parts.

### 1. Taxonomy → 16 genres
Add 8 genre elements to `STARTER_TAXONOMY` (PO-confirmed): **Horror, Poetry, Young Adult, Graphic Novels, Philosophy, Science, Self-Help, Memoir** (slugs `horror`, `poetry`, `young-adult`, `graphic-novels`, `philosophy`, `science`, `self-help`, `memoir`). Styles/signals unchanged.

### 2. A shared `subjectsToGenres` derivation (the core new logic)
New `apps/seeder/src/genres.ts`:
- `export function subjectsToGenres(subjects: readonly string[]): string[]` — deterministic, multi-genre, conservative.
- A rule table: each genre slug → keyword patterns matched (lowercased, token-aware) against the book's subjects (e.g. `horror`→`horror`; `poetry`→`poetry`,`poems`; `young-adult`→`young adult`,`juvenile fiction`; `graphic-novels`→`comic`,`graphic novel`,`cartoons`; `philosophy`→`philosophy`; `science`→`science`,`physics`,`biology`,`mathematics` (NOT `science fiction`); `self-help`→`self-help`,`personal development`; `memoir`→`memoir`,`autobiograph`; plus the existing 8).
- **Disambiguation rules** so the broad terms don't over-tag: `science-fiction` is matched before/instead of `science` and `literary-fiction` when the subject is "science fiction"; **`literary-fiction` is a fiction *fallback*** — applied only when a fiction marker is present (`fiction`) **and** no more-specific narrative genre (sci-fi/fantasy/mystery/thriller/romance/horror/young-adult) matched. The exact table + precedence is the deliverable; it favors precision over recall (genre is a revisable assertion — a curator can always add more).
- **Alignment:** the seed path adopts `subjectsToGenres(book.subjects)` (unioned with the fetch bucket) so freshly-seeded books and recast books get the same genres. Low-risk additive change in `apps/seeder/src/index.ts`.

### 3. The recast job (no fetch)
New `apps/seeder/src/recast.ts` + a `seed:recast` package script. Using the existing `connectResilientRelay` (the seeder already publishes through it; `RelayConnection.query` is the read path the librarian uses):
1. Publish the new taxonomy elements (kind-39998 `book-tags`) so `/api/tags` lists them.
2. **Page** the books concept (`kind 39999`, `#z` books header) by a `created_at` cursor (relay-cap discipline, ADR 0021 spirit — never a single unbounded read).
3. For each record, `subjectsToGenres(record.subjects)`; for each derived genre publish a librarian `BookTagAssertion` (reusing `toBookTagAssertionEvent` + the existing checkpoint/`publish`). **Idempotent** (d-tag replace) and **non-destructive** (only librarian-authored assertions; never touches other asserters).
4. Emit **per-genre yields**; a genre that derives **zero** books from the catalog is dropped from the published taxonomy (so the grid never shows an empty genre — AC-6). With 11.2k books the 8 additions are expected to populate.
Running it is a one-time ops step (like a migration), tracked in the book's Deploy/ops notes; tests verify the derivation + idempotency on fixtures, not the live run.

### 4. Decouple genre colors from the cover-gradient hash
Add `export const GENRE_COLORS: Record<string, string>` to `packages/ui/src/palette.ts` — 16 curated, distinct, brand-consistent backgrounds keyed by genre slug. `genreColor(slug)` becomes `GENRE_COLORS[slug] ?? <existing hash into GENRE_PALETTE>` (hash fallback for any unknown slug). **Cover gradients (`coverGradient`/`COVERS`) are untouched** — `GENRE_PALETTE.length` does not change, so no cover/avatar re-colors. The 8 existing genres' *card* colors become explicit (a small, intentional one-time shift from their hashed colors). Hex lives in `palette.ts` (the sanctioned home, like `GENRE_PALETTE`).

## Consequences
- **Enables:** 16 browsable genres; every catalog book recast from preserved subjects; a reusable, deterministic genre derivation shared by seed + recast; intentional per-genre colors without touching covers.
- **Constrains / debt:** the keyword rule table is heuristic — it will mis-tag some books (acceptable: genre is a revisable assertion; curators correct it). The derivation favors precision; recall gaps are fine.
- **Ops run (like a migration):** the recast must be run against staging to populate the new genres — a deploy step, not automatic. Recorded in Deploy/ops notes.
- **Affects existing fixtures?** No event fixtures. New tests only. The 8 genre cards change color (intentional).
- **New dependency?** No.
- **PRD section change required?** No. Implements §5.6.

## Implementation notes
- `apps/seeder/src/taxonomy.ts`: +8 genre entries (16 total).
- `apps/seeder/src/genres.ts` (new): `subjectsToGenres(subjects)` + the rule table + precedence; pure, unit-tested.
- `apps/seeder/src/index.ts`: seed path unions `subjectsToGenres(book.subjects)` with the fetch bucket (additive).
- `apps/seeder/src/recast.ts` (new) + `package.json` `seed:recast`: connect → publish taxonomy → paged `conn.query` of the books concept → derive → publish librarian assertions (checkpointed, idempotent, non-destructive) → per-genre yield report.
- `packages/ui/src/palette.ts`: `GENRE_COLORS` (16 distinct). `apps/web/src/lib/view-model.ts`: `genreColor` reads `GENRE_COLORS` first, hash fallback.
- **No API/web logic change** beyond `genreColor`: `/api/tags`, `/api/genres/:slug/books`, `GenreGrid`, `/genre/:slug` already render the taxonomy + assertions generically. Verify the grid lays out 16 cards.

## Out of scope
- OL re-fetch / seeder fetch-path change; ML clustering; sub-genres/hierarchy; styles & signals; aggregation/write-path changes.

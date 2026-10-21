# ADR 0096: Workers read the catalog in pages

**Status:** Accepted
**Date:** 2026-10-21
**Story:** `engineering-team/stories/108-catalog-in-pages.md`

## Context
The labels pass (ADR 0094), the indexer (ADR 0013) and the shelves worker (ADR 0036) each read every catalog record and every tag assertion into memory before working. That was fine at 11,300 books. The Open Library import (story 109) brings about 159,000, and the droplet has no swap.

## Decision
1. **`forEachPage(fetchPage, onPage, opts)`** in `@unbnd/relay`: the same backwards walk and stop rules as `queryAllPages` (short page, no new events, page and time budgets), but it awaits `onPage(newEvents)` per page and retains only seen ids.
2. **`forEachCatalogPage({ query, librarian, pageSize, onPage })`** in `@unbnd/search`: pages the librarian's records under `books`; for each page it reads the `book-tag-assertions` items whose `a` names one of the page's books (chunks of 250 addresses), groups them by book slug, and awaits `onPage(records, assertionsBySlug)`.
3. **Labels pass:** taxonomy first (stop if empty), then a one-event probe for any assertion (stop if none), then each catalog page. The re-read before signing (ADR 0094 §5) is unchanged.
4. **Indexer:** `configureIndex`, `deleteAll`, then for each page build its documents and upsert them.
5. **Shelves:** `readBooks` returns a summary per record (id, pubkey, kind, `created_at`, and only the `d`, `added` and `delisted` tags), built page by page; genre membership reads assertions only for books with standing reviews.

## Consequences
- Peak memory follows the page size (500 records plus their assertions), not the catalog size.
- Each page adds assertion reads; a pass over 159,000 books makes about 320 page reads and as many assertion reads.
- A relay read that times out still returns what it has (the pager stops on a short page); unchanged from before and recorded on ADR 0094.
